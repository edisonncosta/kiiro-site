// Kiiro — avaliação pelo link que o profissional manda (/i/ID): quem já fez serviço ou conhece o trabalho.
// POST /.netlify/functions/indicar  { profissionalId, profissionalWhatsapp, profissionalNome, nota (1-5), relacao, texto, nome, whatsapp }
// Fica "pendente" até a aprovação no painel (aba Avaliações por link). Aprovada, entra nas avaliações e na nota.
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s, max = 80) => String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const comPais = (d) => (d.length === 10 || d.length === 11 ? "55" + d : d);
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const RELACOES = ["Já contratou", "Vizinho", "Amigo ou família", "Trabalhamos juntos"];

export default async (req) => {
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405 });
  let d;
  try { d = JSON.parse(await req.text()); } catch { return json({ erro: "JSON inválido" }, 400); }

  const whats = comPais(soDigitos(d.whatsapp));
  const proWhats = comPais(soDigitos(d.profissionalWhatsapp));
  const ind = {
    data: new Date().toISOString(),
    profissionalId: limpa(d.profissionalId, 40),
    profissionalWhatsapp: proWhats,
    profissionalNome: limpa(d.profissionalNome, 60),
    nota: Math.round(Number(d.nota)),
    relacao: RELACOES.includes(d.relacao) ? d.relacao : "",
    texto: String(d.texto || "").trim().slice(0, 400),
    nome: limpa(d.nome, 60),
    whatsapp: whats,
    status: "pendente",
  };
  if (whats.length < 12 || whats.length > 13) return json({ erro: "WhatsApp inválido" }, 400);
  if (!ind.profissionalId || !ind.nome || !(ind.nota >= 1 && ind.nota <= 5) || !ind.relacao || ind.texto.length < 10) return json({ erro: "Dados faltando" }, 400);
  if (proWhats && whats.endsWith(proWhats.slice(-9))) return json({ erro: "proprio" }, 400);

  const store = getStore("indicacoes");
  // a mesma pessoa indica o mesmo profissional uma vez só
  const chaveDup = `${proWhats || ind.profissionalId}_${whats}`;
  const { blobs } = await store.list({ prefix: chaveDup });
  if (blobs.length) return json({ erro: "repetida" }, 409);
  await store.setJSON(`${chaveDup}_${randomUUID().slice(0, 8)}`, ind);

  if (process.env.NTFY_TOPIC) {
    try {
      await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        topic: process.env.NTFY_TOPIC,
        title: `⭐ Avaliação ${ind.nota}★ para ${ind.profissionalNome} (pelo link)`,
        message: `${ind.nome}${ind.relacao ? ` (${ind.relacao})` : ""}${ind.texto ? `: "${ind.texto.slice(0, 160)}"` : ""}\nAprove no painel, aba Avaliações por link.`,
        tags: ["star"],
      }) });
    } catch {}
  }
  return json({ ok: true });
};
