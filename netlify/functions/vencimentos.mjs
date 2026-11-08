// Kiiro — todo dia de manhã avisa no celular (ntfy) os anúncios que vencem em até 3 dias.
// Cria a fatura de renovação (aba Pagamentos do painel) e, ao tocar no aviso, abre o WhatsApp da empresa
// com a mensagem de cobrança e o link /pagar (QR Code do Pix + botão "Já paguei").
// A chave Pix vem de patrocinios.js (window.KIIRO_PIX) — é lida do próprio site.
import { getStore } from "@netlify/blobs";
import { lerFaturas, salvarFaturas, lerPrecos, valorDe, novoId, somaMeses, somaDias, reais, NOMES } from "../lib/faturas.mjs";

export const config = { schedule: "0 12 * * *" }; // 12:00 UTC = 9h em Brasília

const diaSP = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const br = (iso) => String(iso).split("-").reverse().join("/");

export default async () => {
  if (!process.env.NTFY_TOPIC) return new Response("sem NTFY_TOPIC");
  const site = (process.env.URL || "https://chamakiiro.com.br").replace(/\/$/, "");
  const admin = getStore("admin");
  const lista = (await admin.get("anuncios", { type: "json" })) || {};
  const avisados = (await admin.get("anunciosAvisados", { type: "json" })) || {};

  // chave Pix: a mesma que aparece no site
  let pix = "";
  try {
    const js = await (await fetch(`${site}/patrocinios.js`)).text();
    const m = js.match(/KIIRO_PIX\s*=\s*\{[^}]*chave:\s*"([^"]*)"/);
    pix = m ? m[1] : "";
  } catch {}

  const faturas = await lerFaturas();
  const { precos } = await lerPrecos(site);
  const hoje = diaSP(Date.now());
  const limite = diaSP(Date.now() + 3 * 864e5);
  let n = 0;
  for (const a of Object.values(lista)) {
    if (!a || String(a.id).endsWith("-g") || a.pausado || !a.ate) continue;
    if (a.ate < hoje || a.ate > limite) continue;
    if (avisados[a.id] === a.ate) continue; // já avisou deste vencimento
    let w = String(a.contato || "").replace(/\D/g, "");
    if (w.length === 10 || w.length === 11) w = "55" + w;
    // fatura de renovação (1 mês) — só cria se ainda não tem uma aberta para este anúncio
    let ft = Object.values(faturas).find((x) => x.anuncio === a.id && x.tipo === "renovacao" && (x.status === "pendente" || x.status === "informado"));
    if (!ft) {
      const valor = valorDe(precos, a.formato === "temporada" ? "inicio" : a.formato, 1);
      if (valor > 0) {
        const desde = somaDias(a.ate, 1), id = novoId();
        ft = faturas[id] = {
          id, tipo: "renovacao", anuncio: a.id, empresa: a.nome, contato: a.contato || "", formato: a.formato || "", meses: 1, valor,
          descricao: `${NOMES[a.formato] || "Anúncio"}${a.alvoCidade ? " · " + a.alvoCidade : ""}${a.categoria && a.categoria !== "Todos" ? " · " + a.categoria : ""} · renovação`,
          periodo: `${br(desde)} a ${br(somaDias(somaMeses(desde, 1), -1))}`, inicio: desde, fim: somaDias(somaMeses(desde, 1), -1), vence: a.ate, status: "pendente", criada: new Date().toISOString(),
        };
      }
    }
    const linkPagar = ft ? `${site}/pagar?f=${ft.id}` : "";
    const msg = `Olá! Aqui é da Kiiro 💛 O anúncio da ${a.nome} fica no ar até ${br(a.ate)}. Quer renovar?` +
      (linkPagar ? `\n\nA fatura do próximo mês (${reais(ft.valor)}) está neste link, com o QR Code do Pix:\n${linkPagar}\n\nDepois é só tocar em "Já paguei".` : pix ? `\n\nÉ só fazer o Pix para a chave:\n${pix}\n\ne mandar o comprovante aqui.` : "") +
      ` Obrigado pela parceria! 🙌`;
    try {
      await fetch("https://ntfy.sh/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: process.env.NTFY_TOPIC,
          title: `⏰ Anúncio vence ${a.ate === hoje ? "hoje" : "em " + br(a.ate)}: ${a.nome}`,
          message: `Toque para mandar a cobrança da renovação${ft ? " (" + reais(ft.valor) + ")" : ""} no WhatsApp.`,
          tags: ["alarm_clock"],
          click: w ? `https://wa.me/${w}?text=${encodeURIComponent(msg)}` : `${site}/painel`,
        }),
      });
      avisados[a.id] = a.ate; n++;
    } catch {}
  }
  await admin.setJSON("anunciosAvisados", avisados);
  await salvarFaturas(faturas);
  return new Response(`avisos: ${n}`);
};
