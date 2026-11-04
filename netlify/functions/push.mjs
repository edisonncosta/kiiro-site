// Kiiro — inscrição para receber avisos no celular.
// GET  /.netlify/functions/push                         → { chave } (chave pública para o navegador)
// POST /.netlify/functions/push { acao: "inscrever", sub, tipo: "pro"|"cliente", whats }
// POST /.netlify/functions/push { acao: "sair", endpoint }
import { chavesVapid, salvarInscricao, removerInscricao, enviarUm, normWhats } from "../lib/push.mjs";

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  if (req.method === "GET") return json({ chave: (await chavesVapid()).publica });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  let d;
  try { d = JSON.parse(await req.text()); } catch { return json({ erro: "JSON inválido" }, 400); }

  if (d.acao === "sair") {
    if (typeof d.endpoint === "string" && d.endpoint.startsWith("https://")) await removerInscricao(d.endpoint);
    return json({ ok: true });
  }
  if (d.acao !== "inscrever") return json({ erro: "Ação inválida" }, 400);
  const s = d.sub || {};
  const ok = typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 &&
    s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
  if (!ok) return json({ erro: "Inscrição inválida" }, 400);
  const tipo = d.tipo === "pro" ? "pro" : "cliente";
  const whats = normWhats(d.whats);
  if (tipo === "pro" && !whats) return json({ erro: "WhatsApp inválido" }, 400);
  const sub = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
  await salvarInscricao(sub, tipo, whats);
  // aviso de boas-vindas: confirma na hora que está funcionando
  await enviarUm(sub, {
    title: "Avisos da Kiiro ativados 💛",
    body: tipo === "pro" ? "Você vai saber na hora quando um cliente te chamar e quando receber avaliação." : "A gente te avisa por aqui sobre os seus pedidos.",
    url: "/", tag: "kiiro-boas-vindas",
  });
  return json({ ok: true });
};
