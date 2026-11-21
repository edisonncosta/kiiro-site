// Kiiro — Acontece: publica sozinho os eventos da busca automática (ramo "sugestoes" do GitHub).
// Edison pediu (21/11/2026): não precisa aprovar, só não pode duplicar.
// Não duplica: guarda os já importados (sid) e confere nome + dia contra o que já está publicado e contra a base (acontece-dados.js).
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const SUG = "https://raw.githubusercontent.com/edisonncosta/kiiro-site/sugestoes/acontece.json";
const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const dataOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

// mesmo evento: mesma cidade, datas que se cruzam e um nome contendo o outro (ou igual)
function igual(a, b) {
  if (norm(a.cidade) && norm(b.cidade) && norm(a.cidade) !== norm(b.cidade)) return false;
  const ai = a.dia, af = a.ate || a.dia, bi = b.dia, bf = b.ate || b.dia;
  if (!ai || !bi || ai > bf || bi > af) return false;
  const na = norm(a.nome), nb = norm(b.nome);
  return na === nb || (na.length >= 10 && nb.includes(na)) || (nb.length >= 10 && na.includes(nb));
}

async function imagemDe(e) {
  let url = /^https:\/\//.test(e.imagem || "") ? e.imagem : "";
  if (!url && /^https:\/\//.test(e.fonte || "")) {
    try {
      const insta = /instagram\.com|facebook\.com/.test(e.fonte);
      const pg = await fetch(e.fonte, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": insta ? "facebookexternalhit/1.1" : "Mozilla/5.0 (compatible; KiiroBot/1.0; +https://chamakiiro.com.br)" } });
      const html = pg.ok ? (await pg.text()).slice(0, 400000) : "";
      const m = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (m) url = new URL(m[1].replace(/&amp;/g, "&"), e.fonte).href;
    } catch {}
  }
  if (!url) return null;
  try {
    const im = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const tipo = im.headers.get("content-type") || "";
    const b = im.ok && /^image\//.test(tipo) ? Buffer.from(await im.arrayBuffer()) : null;
    // imagem muito pequena costuma ser logo/ícone, não a divulgação
    if (b && b.length > 8000 && b.length < 4 * 1024 * 1024) { const fid = randomUUID(); await getStore("acontece-fotos").set(fid, b); return fid; }
  } catch {}
  return null;
}

// base = endereço do site (para ler acontece-dados.js). Retorna quantos publicou.
export async function publicarSugestoes(base, { forcar = false } = {}) {
  const st = getStore("acontece");
  const agora = Date.now();
  if (!forcar) {
    const ult = Number(await st.get("auto-ultima")) || 0;
    if (agora - ult < 20 * 60 * 1000) return 0; // no máximo a cada 20 min
  }
  await st.set("auto-ultima", String(agora));

  let sug = [];
  try { const r = await fetch(SUG, { signal: AbortSignal.timeout(6000) }); if (r.ok) sug = (await r.json()).eventos || []; } catch {}
  let baseEv = [];
  try { const t = await (await fetch(`${base}/acontece-dados.js`, { signal: AbortSignal.timeout(6000) })).text(); baseEv = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).eventos || []; } catch {}

  const ja = new Set((await st.get("importados", { type: "json" })) || []);
  const hoje = new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const novos = [];
  for (const e of sug) {
    const sid = String(e.sid || norm(e.nome) + (e.dia || "")).slice(0, 80);
    if (ja.has(sid)) continue;
    if (!e.nome || !dataOk(e.dia) || (e.ate || e.dia) < hoje) { ja.add(sid); continue; }
    if (novos.length >= 20) break;
    novos.push({ e, sid });
  }

  // eventos da busca que ficaram "para aprovar" no painel (antes desta mudança) também saem publicados
  const { blobs } = await st.list({ prefix: "p-" });
  const pendAuto = [];
  for (const b of blobs) { const x = await st.get(b.key, { type: "json" }); if (x && x.auto && x.tipo === "indicacao") pendAuto.push({ k: b.key, x }); }

  if (!novos.length && !pendAuto.length) { await st.setJSON("importados", [...ja].slice(-2000)); return 0; }

  const prontos = [];
  for (const { e, sid } of novos) {
    const fid = await imagemDe(e);
    prontos.push({ sid, item: { id: "a-" + randomUUID().slice(0, 8), tipo: e.tipo === "lugar" ? "lugar" : "evento", nome: String(e.nome).slice(0, 90), cidade: String(e.cidade || "").slice(0, 40),
      local: String(e.local || "").slice(0, 120), dia: e.dia, ate: dataOk(e.ate) ? e.ate : "", hora: String(e.hora || "").slice(0, 30), desc: String(e.desc || "").slice(0, 600),
      marcas: Array.isArray(e.marcas) ? e.marcas.slice(0, 8) : [], fotos: fid ? [fid] : [], fonte: /^https?:\/\//.test(e.fonte || "") ? String(e.fonte).slice(0, 300) : "", auto: true, aprovado: new Date().toISOString() } });
  }

  // lê o publicado de novo bem na hora de gravar, para não duplicar nem perder o que entrou no meio
  const pub = (await st.get("publico", { type: "json" })) || {};
  pub.itens ||= []; pub.fotos ||= {}; pub.coms ||= {};
  const existe = (it) => pub.itens.some((i) => igual(i, it)) || baseEv.some((i) => igual(i, it));
  let n = 0;
  for (const { sid, item } of prontos) {
    ja.add(sid);
    if (existe(item)) { for (const f of item.fotos) await getStore("acontece-fotos").delete(f); continue; }
    pub.itens.push(item); n++;
  }
  for (const { k, x } of pendAuto) {
    const item = { id: "u-" + k.slice(-8), tipo: x.qual === "lugar" ? "lugar" : "evento", nome: x.nome, cidade: x.cidade, local: x.local, dia: x.dia, ate: x.ate || "", hora: x.hora || "",
      desc: x.desc || "", marcas: x.marcas || [], fotos: x.fotos || [], fonte: x.fonte || "", auto: true, aprovado: new Date().toISOString() };
    if (!existe(item)) { pub.itens.push(item); n++; }
    await st.delete(k);
  }
  await st.setJSON("publico", pub);
  await st.setJSON("importados", [...ja].slice(-2000));
  return n;
}
