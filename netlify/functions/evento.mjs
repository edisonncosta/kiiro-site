// Kiiro — contador de uso do site (sem dados pessoais).
// O site manda só o tipo do evento e, às vezes, uma palavra (o serviço ou o que foi buscado).
// Guarda um total por dia no Netlify Blobs, store "metricas", chaves "AAAA-MM-DD#0" a "#3".
// Endereço: POST /.netlify/functions/evento   corpo: {"t":"visita"} ou {"t":"busca","k":"piscina"}
import { getStore } from "@netlify/blobs";

const TIPOS = new Set(["visita", "perfil", "chamar", "busca", "busca_vazia", "cat", "cad_inicio", "cad_envio", "anuncie_ver", "anuncie_quero", "sobre", "patro_ver", "patro_clique", "local_usar", "local_sim", "orc_abrir", "orc_envio", "indicar", "cidade", "doe_abrir", "doe_valor", "doe_copiar", "ia"]);
const COM_PALAVRA = { busca: "buscas", busca_vazia: "vazias", cat: "cats", perfil: "perfis", chamar: "chamados", patro_ver: "patro_ver", patro_clique: "patro_clique", cidade: "cidades_esc", doe_valor: "doe_valores", ia: "ia_servicos" };
const MAX_PALAVRAS = 300;
const POR_HORA = new Set(["visita", "perfil", "chamar", "cad_envio", "orc_envio"]);

export const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD

export default async (req, context) => {
  if (req.method !== "POST") return new Response("", { status: 405 });
  const ua = req.headers.get("user-agent") || "";
  if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp/i.test(ua)) return new Response(null, { status: 204 });

  let d;
  try { d = JSON.parse(await req.text()); } catch { return new Response("", { status: 400 }); }
  const t = String(d && d.t || "");
  // por profissional (para a conta dele): quem abriu o perfil e quem tocou em Chamar
  if (t === "pro_ver" || t === "pro_clique") {
    const w = String(d.w || "").replace(/\D/g, "");
    if (w.length < 12 || w.length > 13) return new Response("", { status: 400 });
    const st = getStore({ name: "pros", consistency: "strong" });
    const ch = `${w}#${Math.floor(Math.random() * 4)}`;
    const m = (await st.get(ch, { type: "json" })) || {};
    const g = (m[t === "pro_ver" ? "v" : "c"] ||= {});
    const dia = hojeSP();
    g[dia] = (g[dia] || 0) + 1;
    await st.setJSON(ch, m);
    return new Response(null, { status: 204 });
  }
  if (!TIPOS.has(t)) return new Response("", { status: 400 });
  let k = String(d.k || "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!t.startsWith("patro") && t !== "cidade" && t !== "ia") k = k.toLowerCase();

  // 4 "gavetas" por dia, para dois eventos ao mesmo tempo quase nunca se atropelarem
  const store = getStore({ name: "metricas", consistency: "strong" });
  const chave = `${hojeSP()}#${Math.floor(Math.random() * 4)}`;
  const m = (await store.get(chave, { type: "json" })) || { n: {} };
  m.n[t] = (m.n[t] || 0) + 1;
  // por hora (horário de Brasília), para os gráficos do painel
  if (POR_HORA.has(t)) {
    const hh = new Date().toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).slice(0, 2);
    const h = ((m.h ||= {})[hh] ||= {});
    h[t] = (h[t] || 0) + 1;
  }
  const grupo = COM_PALAVRA[t];
  if (grupo && k) {
    const g = (m[grupo] ||= {});
    if (g[k] || Object.keys(g).length < MAX_PALAVRAS) g[k] = (g[k] || 0) + 1;
  }
  // de onde a pessoa acessa (aproximado pela internet; só a cidade, nada pessoal)
  if (t === "visita") {
    const g = context && context.geo;
    const cid = g && g.city ? String(g.city).slice(0, 40) + (g.subdivision && g.subdivision.code ? ` (${g.subdivision.code})` : g.country && g.country.code && g.country.code !== "BR" ? ` (${g.country.code})` : "") : "Não identificada";
    const geo = (m.geo ||= {});
    if (geo[cid] || Object.keys(geo).length < MAX_PALAVRAS) geo[cid] = (geo[cid] || 0) + 1;
  }
  await store.setJSON(chave, m);
  return new Response(null, { status: 204 });
};
