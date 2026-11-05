// Kiiro — todo dia às 9h (Brasília) avisa no seu celular (ntfy) os lembretes do painel:
// um dia antes ("Amanhã: …") e no próprio dia ("Hoje: …"). Cada aviso sai uma vez só.
import { lerLembretes, salvarLembretes, diaSP } from "../lib/lembretes.mjs";

export const config = { schedule: "0 12 * * *" }; // 12:00 UTC = 9h em Brasília

const br = (iso) => String(iso).split("-").reverse().join("/");

export default async () => {
  if (!process.env.NTFY_TOPIC) return new Response("sem NTFY_TOPIC");
  const site = (process.env.URL || "https://chamakiiro.netlify.app").replace(/\/$/, "");
  const hoje = diaSP(), amanha = diaSP(Date.now() + 864e5);
  const lista = await lerLembretes();
  let n = 0, mudou = false;
  for (const l of lista) {
    if (l.feito || !l.data) continue;
    l.avisos ||= {};
    const qual = l.data === amanha && !l.avisos.vespera ? "vespera" : l.data <= hoje && !l.avisos.dia ? "dia" : "";
    if (!qual) continue;
    const painel = process.env.ADMIN_KEY ? `${site}/painel?chave=${encodeURIComponent(process.env.ADMIN_KEY)}&aba=lembretes` : site;
    try {
      await fetch("https://ntfy.sh/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: process.env.NTFY_TOPIC,
          title: `${qual === "vespera" ? "⏰ Amanhã" : l.data < hoje ? "⚠️ Atrasado" : "📌 Hoje"}: ${l.titulo}`,
          message: `${br(l.data)}${l.nota ? "\n" + l.nota : ""}`,
          tags: ["alarm_clock"], priority: 4,
          click: l.link || painel,
          actions: [{ action: "view", label: "Ver lembretes", url: painel }],
        }),
      });
      l.avisos[qual] = new Date().toISOString(); mudou = true; n++;
    } catch { /* tenta de novo amanhã */ }
  }
  if (mudou) await salvarLembretes(lista);
  return new Response(`avisos de lembrete: ${n}`);
};
