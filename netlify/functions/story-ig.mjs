// Kiiro — publica o story "Chegou gente boa na Kiiro!" direto no Instagram da Kiiro.
// Quem chama é a página /story-novo.html (aberta pelo painel ou pelo aviso de cadastro novo no celular).
//
//   GET  ?img=ID            → serve a imagem guardada (o Instagram busca por aqui)
//   GET  ?t=TOKEN           → dados do profissional (link do aviso de cadastro novo, vale 7 dias)
//   POST ?t=TOKEN  (jpeg)   → publica o story desse profissional
//   POST ?k=ADMIN_KEY&w=WHATS&ig=USUARIO (jpeg) → publica pelo painel
//
// Variáveis no Netlify:
//   IG_TOKEN    token de acesso do Instagram da Kiiro (Instagram Login "IG…" ou Facebook "EA…")
//   IG_USER_ID  ID da conta do Instagram (padrão: 17841459921197030, @chamakiiro)
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const V = "v21.0";
const DIA = 864e5;
const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const limparIg = (v) => { const s = String(v || ""); return /(gmail|hotmail|outlook|yahoo|icloud|live|bol|uol|terra)\.?com(\.br)?$|.@./i.test(s) ? "" : s.replace(/[^A-Za-z0-9._]/g, "").slice(0, 30); };

// token: o mais novo guardado (renovado sozinho) ou o da variável
async function token(adm) {
  const env = process.env.IG_TOKEN || "";
  let t = null;
  try { t = await adm.get("igToken", { type: "json" }); } catch {}
  let atual = t && t.base === env.slice(-12) ? t.token : env;
  // token do Instagram Login vale 60 dias: renova quando passa de 20 dias
  if (atual.startsWith("IG") && (!t || t.base !== env.slice(-12) || Date.now() - (t.em || 0) > 20 * DIA)) {
    try {
      const r = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(atual)}`)).json();
      if (r.access_token) { atual = r.access_token; await adm.setJSON("igToken", { token: atual, em: Date.now(), base: env.slice(-12) }); }
    } catch {}
  }
  return atual;
}

async function chamar(host, caminho, params) {
  const r = await fetch(`https://${host}/${V}/${caminho}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || b.error) throw new Error((b.error && (b.error.error_user_msg || b.error.message)) || `Erro ${r.status}`);
  return b;
}

async function publicar(imgUrl, ig, adm) {
  const tk = await token(adm);
  if (!tk) throw new Error("Falta a variável IG_TOKEN no Netlify.");
  const host = tk.startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com";
  const conta = process.env.IG_USER_ID || "17841459921197030";
  const base = { media_type: "STORIES", image_url: imgUrl, access_token: tk };
  let cont, marcou = false;
  // tenta marcar a pessoa de verdade; se o Instagram não aceitar, publica sem a marcação (o @ já está escrito na imagem)
  if (ig) { try { cont = await chamar(host, `${conta}/media`, { ...base, user_tags: [{ username: ig, x: 0.5, y: 0.6 }] }); marcou = true; } catch {} }
  if (!cont) cont = await chamar(host, `${conta}/media`, base);
  // espera o Instagram processar a imagem
  for (let i = 0; i < 10; i++) {
    const s = await (await fetch(`https://${host}/${V}/${cont.id}?fields=status_code&access_token=${encodeURIComponent(tk)}`)).json().catch(() => ({}));
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR") throw new Error("O Instagram não aceitou a imagem.");
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  const pub = await chamar(host, `${conta}/media_publish`, { creation_id: cont.id, access_token: tk });
  return { id: pub.id, marcou };
}

export default async (req) => {
  const u = new URL(req.url);
  const adm = getStore("admin");
  const imgs = getStore("stories-ig");

  // imagem pública para o Instagram buscar
  const img = u.searchParams.get("img");
  if (req.method === "GET" && img) {
    if (!/^[a-f0-9-]{36}$/.test(img)) return new Response("Inválido", { status: 400 });
    const b = await imgs.get(img, { type: "arrayBuffer" }).catch(() => null);
    return b ? new Response(b, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } }) : new Response("Não encontrada", { status: 404 });
  }

  const postados = (await adm.get("storiesPostados", { type: "json" }).catch(() => null)) || {};
  const t = String(u.searchParams.get("t") || "").replace(/[^a-f0-9-]/g, "");
  let dados = null;
  if (t) {
    dados = await adm.get(`storyTok:${t}`, { type: "json" }).catch(() => null);
    if (!dados || Date.now() - (dados.em || 0) > 7 * DIA) return json(404, { erro: "Link vencido. Abra pelo painel." });
  }

  if (req.method === "GET") {
    if (!dados) return json(400, { erro: "Pedido inválido" });
    return json(200, { ...dados, postado: postados[dados.w] || "" });
  }
  if (req.method !== "POST") return json(405, { erro: "Use POST" });

  const KEY = process.env.ADMIN_KEY;
  const viaPainel = !!KEY && u.searchParams.get("k") === KEY;
  if (!dados && !viaPainel) return json(401, { erro: "Acesso negado" });
  const w = dados ? dados.w : String(u.searchParams.get("w") || "").replace(/\D/g, "");
  const ig = limparIg(dados ? dados.ig : u.searchParams.get("ig"));
  if (!w) return json(400, { erro: "Falta o WhatsApp do profissional" });
  if (postados[w] && u.searchParams.get("de_novo") !== "1") return json(409, { erro: "O story dessa pessoa já foi postado.", postado: postados[w] });

  const corpo = await req.arrayBuffer();
  if (corpo.byteLength < 5000 || corpo.byteLength > 8e6) return json(400, { erro: "Imagem inválida" });
  const id = randomUUID();
  await imgs.set(id, corpo);
  try {
    const r = await publicar(`${u.origin}/.netlify/functions/story-ig?img=${id}`, ig, adm);
    postados[w] = new Date().toISOString();
    await adm.setJSON("storiesPostados", postados);
    if (t) await adm.delete(`storyTok:${t}`).catch(() => {});
    return json(200, { ok: true, ...r });
  } catch (e) {
    return json(502, { erro: String(e.message || e) });
  }
};
