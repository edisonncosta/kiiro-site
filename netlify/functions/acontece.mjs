// Kiiro — Acontece: eventos e lugares que as pessoas mandam, fotos, comentários e "eu vou / já fui / quero ir".
// GET  /.netlify/functions/acontece                    → o que já foi aprovado + contagens (o site junta com a lista fixa)
// POST /.netlify/functions/acontece  { acao: "indicar" | "foto" | "comentario" | "marca", ... }
// Indicações, fotos e comentários ficam "pendentes" até a aprovação no painel (aba Acontece).
// Store "acontece": "publico" (aprovados), "contagens", "p-…" (pendentes). Store "acontece-fotos": as imagens.
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...extra } });
const limpa = (s, max = 80) => String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const texto = (s, max = 600) => String(s || "").trim().slice(0, max);
const idOk = (s) => /^[\w-]{2,60}$/.test(String(s || ""));
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const MARCAS = ["vou", "fui", "quero"];
const MARCAS_OK = new Set(["Grátis", "Pra crianças", "Música", "Esporte", "Feira", "Comunidade", "Comida", "Ponto turístico", "Praia", "Cachoeira", "Pracinha", "Parque", "Trilha", "Mirante", "Pôr do sol", "Pet", "Sombra", "Festa", "Passeio"]);

// "data:image/jpeg;base64,…" → bytes (só imagem, até 2,5 MB)
function imagem(dataUrl) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const b = Buffer.from(m[2], "base64");
  return b.length > 200 && b.length <= 2.5 * 1024 * 1024 ? b : null;
}
async function guardarFoto(dataUrl) {
  const b = imagem(dataUrl); if (!b) return null;
  const id = randomUUID();
  await getStore("acontece-fotos").set(id, b);
  return id;
}

export default async (req) => {
  const st = getStore("acontece");
  if (req.method === "GET") {
    const [pub, cont] = await Promise.all([st.get("publico", { type: "json" }), st.get("contagens", { type: "json" })]);
    const p = pub || {};
    return json({ itens: p.itens || [], fotos: p.fotos || {}, coms: p.coms || {}, n: cont || {} }, 200, { "Cache-Control": "public, max-age=30" });
  }
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405 });
  const ua = req.headers.get("user-agent") || "";
  if (/bot|crawl|spider/i.test(ua)) return new Response(null, { status: 204 });
  let d;
  try { d = JSON.parse(await req.text()); } catch { return json({ erro: "JSON inválido" }, 400); }
  const agora = new Date().toISOString();
  const chave = () => `p-${agora.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

  if (d.acao === "marca") {
    // conta na hora (sem aprovação): cada aparelho manda +1 ou -1
    const alvo = String(d.id || ""), m = String(d.marca || ""), dl = Number(d.delta) === -1 ? -1 : 1;
    if (!idOk(alvo) || !MARCAS.includes(m)) return json({ erro: "Dados faltando" }, 400);
    const cont = (await st.get("contagens", { type: "json" })) || {};
    const c = (cont[alvo] ||= {});
    c[m] = Math.max(0, (c[m] || 0) + dl);
    await st.setJSON("contagens", cont);
    return json({ ok: true, n: c });
  }

  if (d.acao === "comentario") {
    const alvo = String(d.id || ""), t = texto(d.texto, 500), nome = limpa(d.nome, 40);
    if (!idOk(alvo) || t.length < 2 || nome.length < 2) return json({ erro: "Dados faltando" }, 400);
    await st.setJSON(chave(), { tipo: "comentario", alvo, alvoNome: limpa(d.alvoNome, 90), nome, texto: t, data: agora, status: "pendente" });
    return json({ ok: true });
  }

  if (d.acao === "foto") {
    const alvo = String(d.id || "");
    if (!idOk(alvo)) return json({ erro: "Dados faltando" }, 400);
    const fid = await guardarFoto(d.foto);
    if (!fid) return json({ erro: "Foto inválida" }, 400);
    await st.setJSON(chave(), { tipo: "foto", alvo, alvoNome: limpa(d.alvoNome, 90), foto: fid, nome: limpa(d.nome, 40), data: agora, status: "pendente" });
    return json({ ok: true });
  }

  if (d.acao === "indicar") {
    const tipo = d.tipo === "lugar" ? "lugar" : "evento";
    const ind = {
      tipo: "indicacao", qual: tipo, nome: limpa(d.nome, 90), cidade: limpa(d.cidade, 40), local: limpa(d.local, 120),
      dia: /^\d{4}-\d{2}-\d{2}$/.test(d.dia || "") ? d.dia : "", hora: /^\d{2}:\d{2}$/.test(d.hora || "") ? d.hora : "",
      desc: texto(d.desc, 600), marcas: (Array.isArray(d.marcas) ? d.marcas : []).filter((m) => MARCAS_OK.has(m)).slice(0, 8),
      whatsapp: soDigitos(d.whatsapp).slice(0, 13), data: agora, status: "pendente", fotos: [],
    };
    if (ind.nome.length < 3 || !ind.cidade) return json({ erro: "Dados faltando" }, 400);
    if (tipo === "evento" && !ind.dia) return json({ erro: "Coloque a data" }, 400);
    for (const f of (Array.isArray(d.fotos) ? d.fotos : []).slice(0, 5)) { const fid = await guardarFoto(f); if (fid) ind.fotos.push(fid); }
    await st.setJSON(chave(), ind);
    return json({ ok: true });
  }
  return json({ erro: "Ação desconhecida" }, 400);
};
