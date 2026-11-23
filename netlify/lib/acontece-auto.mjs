// Kiiro — Acontece: publica sozinho os eventos da busca automática (ramo "sugestoes" do GitHub).
// Edison pediu (21/11/2026): não precisa aprovar, só não pode duplicar.
// Não duplica: guarda os já importados (sid) e confere nome + dia contra o que já está publicado e contra a base (acontece-dados.js).
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import decodeJpeg from "./jpeg/decoder.js";
import encodeJpeg from "./jpeg/encoder.js";

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

// tira repetidos (mesmo id, ou mesmo nome + cidade + datas): fica o primeiro; se o repetido tem foto e o primeiro não, a foto passa
export function semDuplicados(itens) {
  const fora = [];
  for (const it of itens || []) {
    const ig = fora.find((o) => (o.id && o.id === it.id) || igual(o, it));
    if (ig) { if (!(ig.fotos || []).length && (it.fotos || []).length) ig.fotos = it.fotos; continue; }
    fora.push(it);
  }
  return fora;
}

const UA_BOT = "Mozilla/5.0 (compatible; KiiroBot/1.0; +https://chamakiiro.com.br)";
const ehRede = (u) => /instagram\.com|facebook\.com|fb\.me/.test(u);

// acha a imagem de divulgação dentro do HTML: og:image, twitter:image, image_src ou o "image" do JSON-LD
function imagemNoHtml(html, base) {
  const ms = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"(https?:[^"]+)"/i,
  ];
  for (const re of ms) { const m = html.match(re); if (m) { try { return new URL(m[1].replace(/&amp;/g, "&").replace(/\\\//g, "/"), base).href; } catch {} } }
  return "";
}

async function baixar(url, min = 8000) {
  try {
    const im = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": UA_BOT } });
    const tipo = im.headers.get("content-type") || "";
    const b = im.ok && /^image\//.test(tipo) ? Buffer.from(await im.arrayBuffer()) : null;
    // imagem muito pequena costuma ser logo/ícone, não a divulgação
    return b && b.length > min && b.length < 4 * 1024 * 1024 ? b : null;
  } catch { return null; }
}

// Microlink abre a página num navegador de verdade (pega imagem de página feita em JavaScript) e tira o print quando não há arte.
async function microlink(fonte, print) {
  const q = print
    ? `screenshot=true&meta=false&viewport.width=1080&viewport.height=1080&waitForTimeout=1500`
    : `meta=true`;
  try {
    const r = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(fonte)}&${q}`, { signal: AbortSignal.timeout(print ? 15000 : 9000) });
    const j = r.ok ? await r.json() : null;
    return (print ? j?.data?.screenshot?.url : j?.data?.image?.url) || "";
  } catch { return ""; }
}

// Sympla: quando não dá para pegar a arte pelo link, tira um print da página no tamanho de celular e recorta só o banner do evento.
// O banner é o primeiro bloco "com imagem" logo abaixo da barra escura do topo; para antes do botão branco "Compartilhar".
const ehSympla = (u) => /(^|\.)sympla\.com\.br\//.test(String(u).replace(/^https?:\/\//, ""));
function recortarBanner(jpeg) {
  let im;
  try { im = decodeJpeg(jpeg, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 40, maxMemoryUsageInMB: 256 }); } catch { return null; }
  const { width: W, height: H, data: d } = im;
  const px = (x, y, c) => d[(y * W + x) * 4 + c];
  // linha "de imagem": muita variação de cor; linha lisa: fundo da página ou da barra
  const variacao = (y) => {
    let s = 0, s2 = 0, n = 0;
    for (let x = 0; x < W; x += 4) { const v = (px(x, y, 0) + px(x, y, 1) + px(x, y, 2)) / 3; s += v; s2 += v * v; n++; }
    const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m));
  };
  // botão branco no meio (o "Compartilhar" que fica por cima do pé do banner)
  const brancoNoMeio = (y) => { for (let x = Math.floor(W * 0.42); x < W * 0.58; x += 2) if (px(x, y, 0) < 245 || px(x, y, 1) < 245 || px(x, y, 2) < 245) return false; return true; };
  const lim = Math.floor(H * 0.75);
  let y0 = -1, y1 = -1;
  for (let y = 0; y < lim; y++) {
    const img = variacao(y) > 18;
    if (y0 < 0) { if (img) y0 = y; continue; }
    if (!img || brancoNoMeio(y)) { if (y - y0 >= W * 0.25) { y1 = y; break; } y0 = img ? y : -1; }
  }
  if (y0 < 0 || y1 < 0) return null;
  const h = y1 - y0, out = Buffer.alloc(W * h * 4);
  d.subarray ? out.set(d.subarray(y0 * W * 4, y1 * W * 4)) : Buffer.from(d).copy(out, 0, y0 * W * 4, y1 * W * 4);
  try { return Buffer.from(encodeJpeg({ data: out, width: W, height: h }, 88).data); } catch { return null; }
}
async function printSympla(fonte) {
  const q = "screenshot=true&meta=false&screenshot.type=jpeg&viewport.width=430&viewport.height=932&viewport.deviceScaleFactor=2&viewport.isMobile=true&viewport.hasTouch=true&waitForTimeout=2500";
  try {
    const r = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(fonte)}&${q}`, { signal: AbortSignal.timeout(16000) });
    const j = r.ok ? await r.json() : null;
    const u = j?.data?.screenshot?.url;
    if (!u) return null;
    const im = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const b = im.ok ? Buffer.from(await im.arrayBuffer()) : null;
    const c = b ? recortarBanner(b) : null;
    return c && c.length > 8000 ? c : null;
  } catch { return null; }
}

// Ordem: 1) imagem que a busca já trouxe  2) arte do link (og:image etc.)  3) Instagram em tamanho grande
// 4) arte lida por navegador (Microlink)  5) print da página do evento (não em Instagram/Facebook, que mostram tela de login)
async function imagemDe(e, { print = false, limite = 0 } = {}) {
  const fontes = [e.fonte, ...(Array.isArray(e.fontes) ? e.fontes : [])].filter((u) => /^https:\/\//.test(u || ""));
  const tentar = [];
  if (/^https:\/\//.test(e.imagem || "")) tentar.push(async () => baixar(e.imagem));
  for (const f of fontes) {
    tentar.push(async () => {
      try {
        const pg = await fetch(f, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": ehRede(f) ? "facebookexternalhit/1.1" : UA_BOT } });
        const u = pg.ok ? imagemNoHtml((await pg.text()).slice(0, 600000), f) : "";
        return u ? baixar(u) : null;
      } catch { return null; }
    });
    const post = f.match(/instagram\.com\/(?:[\w.]+\/)?(p|reel)\/([\w-]+)/);
    if (post) tentar.push(async () => baixar(`https://www.instagram.com/p/${post[2]}/media/?size=l`));
  }
  for (const f of fontes) tentar.push(async () => { const u = await microlink(f, false); return u ? baixar(u) : null; });
  // Sympla sem arte no link: print do celular recortado no banner (sempre, mesmo na primeira tentativa)
  for (const f of fontes.filter(ehSympla)) tentar.push(async () => printSympla(f));
  if (print) for (const f of fontes.filter((u) => !ehRede(u) && !ehSympla(u))) tentar.push(async () => { const u = await microlink(f, true); return u ? baixar(u, 15000) : null; });
  for (const t of tentar) {
    if (limite && Date.now() > limite) break;
    const b = await t();
    if (b) { const fid = randomUUID(); await getStore("acontece-fotos").set(fid, b); return fid; }
  }
  return null;
}

// Para os eventos que já estão no ar sem imagem: tenta de novo (até 4 vezes por evento, a última com print da página).
// Roda a cada 10 min pela função agendada, com limite de tempo para não estourar.
export async function completarImagens({ ate = 20000, forcar = false, base = "https://chamakiiro.com.br" } = {}) {
  const st = getStore("acontece"), t0 = Date.now();
  const pub0 = (await st.get("publico", { type: "json" })) || {};
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const tent = (await st.get("img-tentativas", { type: "json" })) || {};
  const semFoto = (pub0.itens || []).filter((i) => !(i.fotos || []).length && (i.fonte || (i.fontes || []).length) && (i.ate || i.dia || "9999") >= hoje);
  // eventos fixos da base (acontece-dados.js) sem foto: a imagem achada vai para as edições (pub.edits[id].fotos)
  try {
    const t = await (await fetch(`${base}/acontece-dados.js`, { signal: AbortSignal.timeout(6000) })).text();
    const evs = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).eventos || [];
    for (const x of evs) {
      const ed = (pub0.edits || {})[x.id] || {};
      if (ed.oculto || (ed.fotos || []).length || (x.ft || []).some((f) => /^img\//.test(f))) continue;
      if (!/^https:\/\//.test(x.fonte || "") || (ed.ate || ed.dia || x.ate || x.dia || "9999") < hoje) continue;
      semFoto.push({ id: x.id, fonte: x.fonte, fixo: true });
    }
  } catch {}
  // no botão do painel (forcar) tenta todos; sozinho, no máximo 4 vezes cada
  const faltam = semFoto.filter((i) => forcar || (tent[i.id] || 0) < 4).sort((a, b) => (tent[a.id] || 0) - (tent[b.id] || 0));
  let achou = 0;
  for (const it of faltam) {
    if (Date.now() - t0 > ate) break;
    tent[it.id] = (tent[it.id] || 0) + 1;
    await st.setJSON("img-tentativas", tent);
    const fid = await imagemDe(it, { print: forcar || tent[it.id] >= 2, limite: t0 + ate });
    if (!fid) continue;
    // grava na hora (se a função for cortada por tempo, o que já achou fica salvo); só preenche quem continua sem foto
    const pub = (await st.get("publico", { type: "json" })) || {};
    if (it.fixo) {
      const ed = ((pub.edits ||= {})[it.id] ||= {});
      if (!(ed.fotos || []).length) { ed.fotos = [fid]; await st.setJSON("publico", pub); achou++; }
      continue;
    }
    const alvo = (pub.itens || []).find((i) => i.id === it.id && !(i.fotos || []).length);
    if (alvo) { alvo.fotos = [fid]; await st.setJSON("publico", pub); achou++; }
  }
  return { achou, faltam: semFoto.length - achou };
}

// base = endereço do site (para ler acontece-dados.js). Retorna quantos publicou.
export async function publicarSugestoes(base, { forcar = false } = {}) {
  // consistência forte: a trava abaixo grava e relê na hora; com a leitura "eventual" ela via o valor antigo e desistia sempre
  const st = getStore({ name: "acontece", consistency: "strong" });
  const agora = Date.now();
  const ult = Number(String((await st.get("auto-ultima")) || "0").split(":")[0]) || 0;
  // no máximo a cada 20 min; e nunca duas rodadas juntas (trava de 2 min)
  if (agora - ult < (forcar ? 2 : 20) * 60 * 1000) return 0;
  const minha = `${agora}:${randomUUID().slice(0, 8)}`;
  await st.set("auto-ultima", minha);
  await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  if ((await st.get("auto-ultima")) !== minha) return 0; // outra rodada pegou a vez

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

  if (!novos.length && !pendAuto.length) {
    await st.setJSON("importados", [...ja].slice(-2000));
    const pub0 = (await st.get("publico", { type: "json" })) || {};
    const limpo = semDuplicados(pub0.itens || []);
    if (limpo.length !== (pub0.itens || []).length) { pub0.itens = limpo; await st.setJSON("publico", pub0); }
    return 0;
  }

  // imagens com limite de tempo (a função agendada é cortada em ~30 s); as que faltarem, completarImagens busca depois
  const prontos = [], limImg = Date.now() + 6000;
  for (const { e, sid } of novos) {
    const fid = Date.now() < limImg ? await imagemDe(e, { limite: limImg }) : null;
    prontos.push({ sid, item: { id: "a-" + randomUUID().slice(0, 8), tipo: e.tipo === "lugar" ? "lugar" : "evento", nome: String(e.nome).slice(0, 90), cidade: String(e.cidade || "").slice(0, 40),
      local: String(e.local || "").slice(0, 120), dia: e.dia, ate: dataOk(e.ate) ? e.ate : "", hora: String(e.hora || "").slice(0, 30), desc: String(e.desc || "").slice(0, 600),
      marcas: Array.isArray(e.marcas) ? e.marcas.slice(0, 8) : [], fotos: fid ? [fid] : [], fonte: /^https?:\/\//.test(e.fonte || "") ? String(e.fonte).slice(0, 300) : "",
      fontes: (Array.isArray(e.fontes) ? e.fontes : []).filter((u) => /^https:\/\//.test(u || "")).slice(0, 4).map((u) => String(u).slice(0, 300)), auto: true, aprovado: new Date().toISOString() } });
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
  pub.itens = semDuplicados(pub.itens);
  await st.setJSON("publico", pub);
  await st.setJSON("importados", [...ja].slice(-2000));
  return n;
}
