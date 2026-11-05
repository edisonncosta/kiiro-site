// Kiiro — registra quando um cliente chama um profissional e avisa no celular (ntfy).
// Endereço: /.netlify/functions/chamar (POST, usado pela página inicial)
import { getStore } from "@netlify/blobs";
import { contaDoToken, salvarConta } from "../lib/contas.mjs";
import { randomUUID } from "node:crypto";
import { enviarPara } from "../lib/push.mjs";

const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s, max = 80) => String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405 });
  let d;
  try { d = JSON.parse(await req.text()); } catch { return new Response("JSON inválido", { status: 400 }); }

  let clienteWhats = soDigitos(d.clienteWhatsapp);
  if (clienteWhats.length < 10 || clienteWhats.length > 13) return new Response("WhatsApp inválido", { status: 400 });
  if (clienteWhats.length === 10 || clienteWhats.length === 11) clienteWhats = "55" + clienteWhats; // DDD 55 também existe

  const chamada = {
    data: new Date().toISOString(),
    clienteNome: limpa(d.clienteNome, 60),
    clienteWhatsapp: clienteWhats,
    profissionalId: limpa(d.profissionalId, 40),
    // o WhatsApp identifica o profissional mesmo se ele refizer o cadastro
    profissionalWhatsapp: soDigitos(d.profissionalWhatsapp).slice(0, 13),
    profissionalNome: limpa(d.profissionalNome),
    categoria: limpa(d.categoria),
    cidade: limpa(d.cidade),
  };
  if (!chamada.clienteNome || !chamada.profissionalNome || !chamada.profissionalId) return new Response("Dados faltando", { status: 400 });

  // a chave começa pela data (para ordenar) e termina com um código aleatório (é o link de avaliação)
  // a página pode mandar o código da chamada (para lembrar o cliente de avaliar quando ele voltar ao site)
  const store = getStore("chamadas");
  let chave = String(d.codigo || "");
  const m = chave.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_[a-f0-9]{12}$/);
  const dataDoCodigo = m ? new Date(m[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, "T$1:$2:$3.$4Z")).getTime() : NaN;
  if (!m || Math.abs(Date.now() - dataDoCodigo) > 10 * 60 * 1000 || (await store.get(chave))) {
    chave = chamada.data.replace(/[:.]/g, "-") + "_" + randomUUID().replace(/-/g, "").slice(0, 12);
  }
  await store.setJSON(chave, chamada);
  // quem está com a conta aberta: a chamada entra no histórico dela
  if (d.conta) {
    try {
      const c = await contaDoToken(d.conta);
      if (c && !(c.chamadas || []).includes(chave)) { c.chamadas = [...(c.chamadas || []), chave].slice(-300); await salvarConta(c); }
    } catch {}
  }

  const tel = clienteWhats.replace(/^55(\d{2})(\d+)/, "($1) $2");
  // ao tocar no aviso, abre o WhatsApp do cliente com a mensagem pronta (contato + link de avaliação)
  const site = process.env.URL || new URL(req.url).origin;
  const link = `${site}/avaliar?c=${encodeURIComponent(chave)}`;
  const cliente1 = chamada.clienteNome.split(" ")[0];
  const prof1 = chamada.profissionalNome.split(" ")[0];
  const texto = `Oi, ${cliente1}! Aqui é da Kiiro 💛 Vi que você chamou ${prof1} pela Kiiro. Conseguiu falar com ${/a$/i.test(prof1) ? "ela" : "ele"}? Depois que o serviço for feito, conta pra gente como foi, leva 10 segundos: ${link}`;
  const zapComTexto = `https://wa.me/${clienteWhats}?text=${encodeURIComponent(texto)}`;
  await avisar({
    title: `${chamada.clienteNome} chamou ${chamada.profissionalNome}`,
    message: `${chamada.categoria} · ${chamada.cidade}\nCliente: ${tel}\nToque para mandar a mensagem com o link de avaliação.`,
    tags: ["bell"],
    click: zapComTexto,
    actions: [
      { action: "view", label: "Pedir avaliação", url: zapComTexto, clear: true },
      { action: "view", label: "Só abrir conversa", url: `https://wa.me/${clienteWhats}` },
    ],
  });

  // aviso no celular do profissional (se ele ativou os avisos)
  try {
    await enviarPara({ tipo: "pro", whats: chamada.profissionalWhatsapp }, {
      title: "🔔 Novo cliente pela Kiiro",
      body: `${cliente1} quer ${chamada.categoria ? chamada.categoria.toLowerCase() : "um orçamento"} e vai te chamar no WhatsApp. Fique de olho nas mensagens!`,
      url: "/", tag: "kiiro-chamada-" + chave.slice(-6),
    });
  } catch {}

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};

async function avisar(msg) {
  if (!process.env.NTFY_TOPIC) return;
  try {
    await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: process.env.NTFY_TOPIC, ...msg }) });
  } catch { /* se o aviso falhar, a chamada continua registrada */ }
}
