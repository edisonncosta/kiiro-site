// Kiiro — IA da busca: a pessoa conta o problema do jeito dela e a IA diz qual serviço chamar.
// POST /.netlify/functions/ia   { texto: "caiu o disjuntor da cozinha" }
// Resposta: { resposta: "frase curta", servicos: ["Eletricista"] }
//        ou { fallback: true } → o site usa as palavras de servicos.js (KIIRO_PALAVRAS).
//
// Variáveis no Netlify:
//   ANTHROPIC_API_KEY  (obrigatória para a IA de verdade; sem ela, o site usa as palavras)
//   ANTHROPIC_MODEL    (opcional; padrão abaixo)
//   IA_LIMITE_DIA      (opcional; máximo de perguntas à IA por dia, padrão 400. Passou disso, usa as palavras)
import { getStore } from "@netlify/blobs";
import vm from "node:vm";

// tenta o modelo da variável e, se não existir na conta, os seguintes
const MODELOS = [...new Set([process.env.ANTHROPIC_MODEL, "claude-haiku-5-5", "claude-haiku-4-5", "claude-sonnet-5-5", "claude-sonnet-4-5"].filter(Boolean))];
let MODELO_OK = null;
const LIMITE = Number(process.env.IA_LIMITE_DIA || 400);
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// lista de serviços: lê o próprio servicos.js do site (assim só existe um lugar para editar)
let SERVICOS = null;
async function servicos(origem) {
  if (SERVICOS) return SERVICOS;
  const r = await fetch(origem + "/servicos.js");
  if (!r.ok) throw new Error("servicos.js " + r.status);
  const ctx = { window: {} };
  vm.runInNewContext(await r.text(), ctx, { timeout: 200 });
  SERVICOS = (ctx.window.KIIRO_SERVICOS || []).map(g => ({ grupo: g.grupo, itens: [...g.itens] }));
  return SERVICOS;
}

export default async (req) => {
  // teste rápido pelo navegador: /.netlify/functions/ia?diag=SUA_ADMIN_KEY&texto=caiu o disjuntor
  const u = new URL(req.url);
  const diag = !!process.env.ADMIN_KEY && u.searchParams.get("diag") === process.env.ADMIN_KEY;
  let d;
  if (diag && req.method === "GET") d = { texto: u.searchParams.get("texto") || "caiu o disjuntor da cozinha" };
  else {
    if (req.method !== "POST") return new Response("", { status: 405 });
    try { d = JSON.parse(await req.text()); } catch { return json({ erro: "JSON inválido" }, 400); }
  }
  const texto = String(d && d.texto || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (texto.length < 3) return json({ erro: "texto curto" }, 400);

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return json(diag ? { fallback: true, erro: "ANTHROPIC_API_KEY não chegou na função (faça um novo deploy depois de criar a variável)" } : { fallback: true });

  // limite diário, para a conta da IA nunca fugir do controle
  try {
    const st = getStore({ name: "ia", consistency: "strong" });
    const k = "uso-" + hojeSP();
    const n = Number(await st.get(k)) || 0;
    if (n >= LIMITE && !diag) return json({ fallback: true });
    await st.set(k, String(n + 1));
  } catch {}

  try {
    const grupos = await servicos(new URL(req.url).origin);
    const validos = new Set(grupos.flatMap(g => g.itens));
    const lista = grupos.map(g => `${g.grupo}: ${g.itens.join("; ")}`).join("\n");
    const sistema = `Você é a assistente da Kiiro, um site do Litoral Norte do RS que conecta quem precisa de um serviço a profissionais da região.
A pessoa vai descrever um problema ou uma necessidade, do jeito dela. Escolha qual profissional ela deve chamar.

Serviços disponíveis (use os nomes EXATAMENTE como estão escritos):
${lista}

Responda SOMENTE com um JSON, sem nada antes ou depois, neste formato:
{"resposta": "uma ou duas frases curtas, simpáticas, em português do Brasil, dizendo quem chamar e por quê", "servicos": ["Nome exato", "..."]}

Regras:
- Em "servicos", de 1 a 3 nomes da lista, do mais indicado para o menos indicado. Só inclua um segundo ou terceiro se fizer sentido de verdade.
- Não invente preço, prazo nem diagnóstico técnico. Não prometa que alguém vai atender.
- Se for uma emergência com risco (fogo, cheiro forte de gás, choque elétrico em alguém, pessoa ferida), diga na resposta para ligar antes para os Bombeiros (193) ou o SAMU (192).
- Se não for um pedido de serviço, ou nada da lista servir, use "servicos": [] e explique em uma frase.`;
    let r = null, ultimoErro = "";
    for (const modelo of MODELO_OK ? [MODELO_OK] : MODELOS) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctl.signal,
        headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: modelo, max_tokens: 300, system: sistema, messages: [{ role: "user", content: texto }] }),
      });
      clearTimeout(t);
      if (r.ok) { MODELO_OK = modelo; break; }
      ultimoErro = `${modelo}: ${r.status} ${(await r.text()).slice(0, 300)}`;
      console.log("IA erro", ultimoErro);
      if (r.status !== 404 && r.status !== 400) break; // chave inválida, sem crédito etc.: não adianta trocar de modelo
    }
    if (!r || !r.ok) return json(diag ? { fallback: true, erro: ultimoErro } : { fallback: true });
    const out = await r.json();
    const bruto = (out.content || []).map(c => c.text || "").join("");
    const m = bruto.match(/\{[\s\S]*\}/);
    if (!m) return json({ fallback: true });
    const res = JSON.parse(m[0]);
    const lista2 = (Array.isArray(res.servicos) ? res.servicos : []).filter(s => validos.has(s)).slice(0, 3);
    const resposta = String(res.resposta || "").trim().slice(0, 400);
    if (!lista2.length && !resposta) return json({ fallback: true });
    return json(diag ? { resposta, servicos: lista2, modelo: MODELO_OK } : { resposta, servicos: lista2 });
  } catch (e) {
    console.log("IA falhou", e && e.message);
    return json(diag ? { fallback: true, erro: String(e && e.message) } : { fallback: true });
  }
};
