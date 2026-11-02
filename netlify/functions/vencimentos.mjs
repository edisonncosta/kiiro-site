// Kiiro — todo dia de manhã avisa no celular (ntfy) os anúncios que vencem em até 3 dias.
// Tocar no aviso abre o WhatsApp da empresa com a mensagem de renovação e a chave Pix prontas.
// A chave Pix vem de patrocinios.js (window.KIIRO_PIX) — é lida do próprio site.
import { getStore } from "@netlify/blobs";

export const config = { schedule: "0 12 * * *" }; // 12:00 UTC = 9h em Brasília

const diaSP = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const br = (iso) => String(iso).split("-").reverse().join("/");

export default async () => {
  if (!process.env.NTFY_TOPIC) return new Response("sem NTFY_TOPIC");
  const site = (process.env.URL || "https://chamakiiro.netlify.app").replace(/\/$/, "");
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

  const hoje = diaSP(Date.now());
  const limite = diaSP(Date.now() + 3 * 864e5);
  let n = 0;
  for (const a of Object.values(lista)) {
    if (!a || String(a.id).endsWith("-g") || a.pausado || !a.ate) continue;
    if (a.ate < hoje || a.ate > limite) continue;
    if (avisados[a.id] === a.ate) continue; // já avisou deste vencimento
    let w = String(a.contato || "").replace(/\D/g, "");
    if (w.length === 10 || w.length === 11) w = "55" + w;
    const msg = `Olá! Aqui é da Kiiro 💛 O anúncio da ${a.nome} fica no ar até ${br(a.ate)}. Quer renovar?${pix ? `\n\nÉ só fazer o Pix para a chave:\n${pix}\n\ne mandar o comprovante aqui.` : ""} Obrigado pela parceria! 🙌`;
    try {
      await fetch("https://ntfy.sh/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: process.env.NTFY_TOPIC,
          title: `⏰ Anúncio vence ${a.ate === hoje ? "hoje" : "em " + br(a.ate)}: ${a.nome}`,
          message: `Toque para mandar a mensagem de renovação${pix ? " com a chave Pix" : ""}.`,
          tags: ["alarm_clock"],
          click: w ? `https://wa.me/${w}?text=${encodeURIComponent(msg)}` : `${site}/painel`,
        }),
      });
      avisados[a.id] = a.ate; n++;
    } catch {}
  }
  await admin.setJSON("anunciosAvisados", avisados);
  return new Response(`avisos: ${n}`);
};
