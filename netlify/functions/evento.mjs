// Kiiro — contador de uso do site (sem dados pessoais).
// O site manda só o tipo do evento e, às vezes, uma palavra (o serviço ou o que foi buscado).
// Guarda um total por dia no Netlify Blobs, store "metricas", chaves "AAAA-MM-DD#0" a "#3".
// Endereço: POST /.netlify/functions/evento   corpo: {"t":"visita"} ou {"t":"busca","k":"piscina"}
import { getStore } from "@netlify/blobs";

const TIPOS = new Set(["visita", "perfil", "chamar", "busca", "busca_vazia", "cat", "cad_inicio", "cad_envio", "anuncie_ver", "anuncie_quero", "sobre", "patro_ver", "patro_clique", "local_usar", "local_sim"]);
const COM_PALAVRA = { busca: "buscas", busca_vazia: "vazias", cat: "cats", perfil: "perfis", chamar: "chamados", patro_ver: "patro_ver", patro_clique: "patro_clique" };
const MAX_PALAVRAS = 300;

export const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD

export default async (req) => {
  if (req.method !== "POST") return new Response("", { status: 405 });
  const ua = req.headers.get("user-agent") || "";
  if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp/i.test(ua)) return new Response(null, { status: 204 });

  let d;
  try { d = JSON.parse(await req.text()); } catch { return new Response("", { status: 400 }); }
  const t = String(d && d.t || "");
  if (!TIPOS.has(t)) return new Response("", { status: 400 });
  let k = String(d.k || "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!t.startsWith("patro")) k = k.toLowerCase();

  // 4 "gavetas" por dia, para dois eventos ao mesmo tempo quase nunca se atropelarem
  const store = getStore({ name: "metricas", consistency: "strong" });
  const chave = `${hojeSP()}#${Math.floor(Math.random() * 4)}`;
  const m = (await store.get(chave, { type: "json" })) || { n: {} };
  m.n[t] = (m.n[t] || 0) + 1;
  const grupo = COM_PALAVRA[t];
  if (grupo && k) {
    const g = (m[grupo] ||= {});
    if (g[k] || Object.keys(g).length < MAX_PALAVRAS) g[k] = (g[k] || 0) + 1;
  }
  await store.setJSON(chave, m);
  return new Response(null, { status: 204 });
};
