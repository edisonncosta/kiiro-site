// Kiiro — registra quando um cliente chama um profissional e avisa no celular (ntfy).
// Endereço: /.netlify/functions/chamar (POST, usado pela página inicial)
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const limpa = (s, max = 80) => String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405 });
  let d;
  try { d = JSON.parse(await req.text()); } catch { return new Response("JSON inválido", { status: 400 }); }

  let clienteWhats = soDigitos(d.clienteWhatsapp);
  if (clienteWhats.length < 10 || clienteWhats.length > 13) return new Response("WhatsApp inválido", { status: 400 });
  if (!clienteWhats.startsWith("55")) clienteWhats = "55" + clienteWhats;

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

  const tel = clienteWhats.replace(/^55(\d{2})(\d+)/, "($1) $2");
  await avisar({
    title: `${chamada.clienteNome} chamou ${chamada.profissionalNome}`,
    message: `${chamada.categoria} · ${chamada.cidade}\nCliente: ${tel}`,
    tags: ["bell"],
    click: `https://wa.me/${clienteWhats}`,
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};

async function avisar(msg) {
  if (!process.env.NTFY_TOPIC) return;
  try {
    await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: process.env.NTFY_TOPIC, ...msg }) });
  } catch { /* se o aviso falhar, a chamada continua registrada */ }
}
