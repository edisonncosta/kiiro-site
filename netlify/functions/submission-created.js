// Kiiro — o Netlify chama esta função sozinho sempre que chega um cadastro novo.
// Manda um aviso no celular (ntfy) com o nome e o serviço.
exports.handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body || "{}");
    if (!payload || payload.form_name !== (process.env.FORM_NAME || "cadastro")) return { statusCode: 200, body: "ignorado" };
    const d = payload.data || {};
    const whats = String(d.whatsapp || "").replace(/\D/g, "");
    if (process.env.NTFY_TOPIC) {
      await fetch("https://ntfy.sh/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: process.env.NTFY_TOPIC,
          title: `🆕 Novo cadastro: ${String(d.nome || "").slice(0, 60)}`,
          message: `${d.servico || ""} · ${d.cidade || ""}\nWhatsApp: ${d.whatsapp || ""}`,
          tags: ["new"],
          click: whats ? `https://wa.me/${whats.length === 10 || whats.length === 11 ? "55" + whats : whats}` : undefined,
        }),
      });
    }
  } catch {}
  return { statusCode: 200, body: "ok" };
};
