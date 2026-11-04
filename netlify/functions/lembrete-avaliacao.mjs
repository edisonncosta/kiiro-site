// Kiiro — todo dia de manhã manda no celular (ntfy) um lembrete por cliente que chamou
// alguém e ainda não avaliou. Tocar no aviso abre o WhatsApp do cliente com o link de avaliação pronto.
// Roda sozinho pelo agendador do Netlify. Cada chamada gera no máximo um lembrete.
import { getStore } from "@netlify/blobs";
import { enviarPara } from "../lib/push.mjs";

export const config = { schedule: "0 12 * * *" }; // 12:00 UTC = 9h em Brasília

const HORA = 3600 * 1000;
const MIN_HORAS = 18;   // espera o serviço acontecer
const MAX_DIAS = 7;     // não lembra chamadas muito antigas
const MAX_POR_DIA = 25; // para não lotar o celular

export default async () => {
  const site = (process.env.URL || "https://chamakiiro.netlify.app").replace(/\/$/, "");

  const chamadas = getStore("chamadas");
  const avaliacoes = getStore("avaliacoes");
  const lembretes = getStore("lembretes");

  const agora = Date.now();
  const avaliadas = new Set((await avaliacoes.list()).blobs.map((b) => b.key));
  const lembradas = new Set((await lembretes.list()).blobs.map((b) => b.key));
  const chaves = (await chamadas.list()).blobs.map((b) => b.key).filter((k) => !avaliadas.has(k) && !lembradas.has(k));

  let enviados = 0;
  for (const k of chaves.sort()) {
    if (enviados >= MAX_POR_DIA) break;
    const ch = await chamadas.get(k, { type: "json" });
    if (!ch) continue;
    const idade = agora - new Date(ch.data).getTime();
    if (idade < MIN_HORAS * HORA || idade > MAX_DIAS * 24 * HORA) continue;

    const cliente = String(ch.clienteNome || "").split(" ")[0];
    const prof = String(ch.profissionalNome || "").split(" ")[0];
    const link = `${site}/avaliar?c=${encodeURIComponent(k)}`;
    const msg = `Oi, ${cliente}! Tudo bem? Aqui é da Kiiro 💛\n\nVocê chamou ${prof} pela Kiiro. Como foi o atendimento?\n\nSua avaliação leva 10 segundos e ajuda muito quem vem depois a escolher bem:\n👉 ${link}\n\nObrigado! 🙌`;
    const quando = new Date(ch.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit" });

    try {
      // 1) aviso direto no celular do cliente, se ele ativou os avisos da Kiiro
      const noCelular = await enviarPara({ tipo: "cliente", whats: ch.clienteWhatsapp }, {
        title: `Como foi com ${prof}? ⭐`,
        body: "Sua avaliação leva 10 segundos e ajuda quem vem depois a escolher bem.",
        url: `/avaliar?c=${encodeURIComponent(k)}`, tag: "kiiro-avaliar-" + k.slice(-6),
      }).catch(() => 0);
      // 2) aviso para você (ntfy), com o WhatsApp do cliente pronto
      if (process.env.NTFY_TOPIC) await fetch("https://ntfy.sh/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: process.env.NTFY_TOPIC,
          title: `⭐ Pedir avaliação: ${ch.clienteNome} → ${ch.profissionalNome}`,
          message: `${ch.categoria} · ${ch.cidade} · chamou ${quando}.${noCelular ? "\n✓ O cliente já recebeu o lembrete no celular." : ""}\nToque para abrir o WhatsApp de ${cliente} com o link pronto.`,
          tags: ["star"],
          click: `https://wa.me/${ch.clienteWhatsapp}?text=${encodeURIComponent(msg)}`,
        }),
      });
      await lembretes.setJSON(k, { data: new Date().toISOString(), celular: noCelular > 0 });
      enviados++;
    } catch { /* tenta de novo amanhã */ }
  }
  return new Response(`lembretes enviados: ${enviados}`);
};
