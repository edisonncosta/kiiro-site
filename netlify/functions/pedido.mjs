// Kiiro — pedido de orçamento (o chat que aparece quando não tem profissional).
// POST /.netlify/functions/pedido  { servico, cidade, descricao, quando, nome, whatsapp }
// Guarda no Blobs ("pedidos") e avisa no celular (ntfy) com botão para abrir o WhatsApp do cliente.
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s, max = 80) => String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405 });
  let d;
  try { d = JSON.parse(await req.text()); } catch { return json({ erro: "JSON inválido" }, 400); }

  let whats = soDigitos(d.whatsapp);
  if (whats.length === 10 || whats.length === 11) whats = "55" + whats;
  if (whats.length < 12 || whats.length > 13) return json({ erro: "WhatsApp inválido" }, 400);

  const pedido = {
    data: new Date().toISOString(),
    servico: limpa(d.servico, 60) || "Serviço",
    cidade: limpa(d.cidade, 40),
    descricao: String(d.descricao || "").trim().slice(0, 600),
    quando: limpa(d.quando, 30),
    nome: limpa(d.nome, 60),
    whatsapp: whats,
    status: "novo",
  };
  if (!pedido.nome || !pedido.descricao) return json({ erro: "Dados faltando" }, 400);

  const chave = pedido.data.replace(/[:.]/g, "-") + "_" + randomUUID().replace(/-/g, "").slice(0, 8);
  await getStore("pedidos").setJSON(chave, pedido);

  const primeiro = pedido.nome.split(" ")[0];
  const onde = pedido.cidade ? ` em ${pedido.cidade}` : "";
  const texto = `Oi, ${primeiro}! Aqui é da Kiiro 💛\n\nRecebi seu pedido de ${pedido.servico.toLowerCase()}${onde}: "${pedido.descricao.slice(0, 160)}".\n\nJá estou procurando um profissional para você e te aviso por aqui.`;
  await avisar({
    title: `📝 Pedido de orçamento: ${pedido.servico}${onde}`,
    message: `${pedido.nome} · ${pedido.quando || "sem data"}\n${pedido.descricao}`,
    tags: ["memo"],
    click: `https://wa.me/${whats}?text=${encodeURIComponent(texto)}`,
    actions: [
      { action: "view", label: "Responder no WhatsApp", url: `https://wa.me/${whats}?text=${encodeURIComponent(texto)}`, clear: true },
    ],
  });
  return json({ ok: true });
};

async function avisar(msg) {
  if (!process.env.NTFY_TOPIC) return;
  try {
    await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: process.env.NTFY_TOPIC, ...msg }) });
  } catch { /* o pedido fica guardado mesmo se o aviso falhar */ }
}
