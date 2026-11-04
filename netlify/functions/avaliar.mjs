// Kiiro — avaliação de uma chamada. Cada chamada pode ser avaliada uma vez só.
// GET  /.netlify/functions/avaliar?c=CODIGO  -> dados para a tela
// POST /.netlify/functions/avaliar           -> { c, feito, nota, motivo, comentario }
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { enviarPara } from "../lib/push.mjs";

const limpa = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
const MOTIVOS = ["Não respondeu", "Preço alto", "Sem agenda", "Ainda vai fazer", "Outro motivo"];

export default async (req) => {
  const chamadas = getStore("chamadas");
  const avaliacoes = getStore("avaliacoes");

  if (req.method === "GET") {
    const c = new URL(req.url).searchParams.get("c") || "";
    const ch = c && (await chamadas.get(c, { type: "json" }));
    if (!ch) return json(404, { erro: "Chamada não encontrada" });
    const ja = await avaliacoes.get(c);
    return json(200, {
      profissionalNome: ch.profissionalNome, categoria: ch.categoria, cidade: ch.cidade,
      clienteNome: ch.clienteNome.split(" ")[0], jaAvaliou: !!ja,
    });
  }

  if (req.method !== "POST") return json(405, { erro: "Método não permitido" });
  let d;
  try { d = JSON.parse(await req.text()); } catch { return json(400, { erro: "JSON inválido" }); }

  const c = String(d.c || "");
  const ch = c && (await chamadas.get(c, { type: "json" }));
  if (!ch) return json(404, { erro: "Chamada não encontrada" });
  if (await avaliacoes.get(c)) return json(409, { erro: "Já avaliado" });

  const feito = d.feito === "sim" ? "sim" : d.feito === "nao" ? "nao" : "";
  const nota = feito === "sim" ? Math.round(Number(d.nota)) : 0;
  const motivo = feito === "nao" && MOTIVOS.includes(d.motivo) ? d.motivo : "";
  if (!feito || (feito === "sim" && !(nota >= 1 && nota <= 5)) || (feito === "nao" && !motivo)) return json(400, { erro: "Dados inválidos" });

  const av = {
    data: new Date().toISOString(),
    profissionalId: ch.profissionalId,
    profissionalWhatsapp: ch.profissionalWhatsapp || "",
    profissionalNome: ch.profissionalNome,
    clienteNome: ch.clienteNome,
    clienteWhatsapp: ch.clienteWhatsapp,
    feito, nota, motivo,
    comentario: limpa(d.comentario, 500),
  };
  // o que foi bom / o que pode melhorar (opcional, lista fixa)
  const TAGS = ["⏰ Pontual", "✨ Caprichoso", "💰 Preço justo", "🙂 Educado", "🧹 Deixou tudo limpo", "⚡ Resolveu rápido", "Atrasou", "Preço alto", "Acabamento", "Comunicação", "Deixou sujeira", "Demorou para resolver"];
  if (feito === "sim" && Array.isArray(d.tags)) {
    const t = [...new Set(d.tags.filter((x) => TAGS.includes(x)))];
    if (t.length) av.tags = t;
  }
  // foto do serviço (opcional, só quando o serviço foi feito)
  const foto = feito === "sim" && typeof d.foto === "string" ? d.foto.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/) : null;
  if (foto) {
    const bytes = Buffer.from(foto[1], "base64");
    if (bytes.length > 0 && bytes.length <= 1.5 * 1024 * 1024) {
      av.fotoId = randomUUID();
      await getStore("fotos").set(av.fotoId, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    }
  }
  await avaliacoes.setJSON(c, av);
  if (av.fotoId) {
    const site = (process.env.URL || "").replace(/\/$/, "");
    await avisar({
      title: `📷 Foto nova na avaliação de ${ch.profissionalNome}`,
      message: `${ch.clienteNome} deu ${nota}★ e mandou uma foto. Se não estiver adequada, oculte pelo painel.`,
      tags: ["camera"],
      attach: site ? `${site}/.netlify/functions/foto?id=${av.fotoId}` : undefined,
      click: site ? `${site}/.netlify/functions/foto?id=${av.fotoId}` : undefined,
    });
  }

  // aviso no celular do profissional: avaliação nova (só quando o serviço foi feito)
  if (feito === "sim") {
    try {
      await enviarPara({ tipo: "pro", whats: ch.profissionalWhatsapp }, {
        title: `⭐ Você recebeu uma avaliação de ${nota} ${nota === 1 ? "estrela" : "estrelas"}`,
        body: `${String(ch.clienteNome || "Um cliente").split(" ")[0]} avaliou seu atendimento na Kiiro. Toque para ver seu perfil.`,
        url: `/#p-${ch.profissionalId}`, tag: "kiiro-avaliacao",
      });
    } catch {}
  }

  // nota baixa ou serviço não feito: avisa no celular
  if (feito === "nao" || nota <= 2) {
    const titulo = feito === "nao"
      ? `${ch.clienteNome}: não fechou com ${ch.profissionalNome}`
      : `⚠️ ${ch.clienteNome} deu ${nota}★ para ${ch.profissionalNome}`;
    await avisar({
      title: titulo,
      message: (feito === "nao" ? `Motivo: ${motivo}` : "Nota baixa") + (av.comentario ? `\n“${av.comentario}”` : ""),
      tags: [feito === "nao" ? "information_source" : "warning"],
      priority: feito === "nao" ? 3 : 4,
      click: `https://wa.me/${ch.clienteWhatsapp}`,
    });
  }
  return json(200, { ok: true });
};

async function avisar(msg) {
  if (!process.env.NTFY_TOPIC) return;
  try {
    await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: process.env.NTFY_TOPIC, ...msg }) });
  } catch {}
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
