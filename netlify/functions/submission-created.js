// Kiiro — o Netlify chama esta função sozinho sempre que chega um cadastro novo.
// Manda um aviso no celular (ntfy) com o nome e o serviço.
exports.handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body || "{}");
    if (payload && payload.form_name === "anuncio") {
      const d = payload.data || {};
      const w = String(d.contato || "").replace(/\D/g, "");
      if (process.env.NTFY_TOPIC) {
        const site = process.env.URL || "";
        await fetch("https://ntfy.sh/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: process.env.NTFY_TOPIC,
            title: `📣 Novo pedido de anúncio: ${String(d.empresa || "").slice(0, 60)}`,
            message: `${d.formato || ""}${d.cidade ? " · " + d.cidade : ""}${d.grupo ? " · " + d.grupo : ""} · ${d.meses || 1} mês(es)\nContato: ${d.contato || ""}\nAprove no painel, aba Anúncios.`,
            tags: ["loudspeaker"],
            click: w ? `https://wa.me/${w.length === 10 || w.length === 11 ? "55" + w : w}?text=${encodeURIComponent(`Olá! Aqui é da Kiiro 💛 Recebemos o pedido de anúncio da ${d.empresa || "sua empresa"}. Vamos combinar?`)}` : site ? `${site}/painel` : undefined,
          }),
        });
      }
      return { statusCode: 200, body: "ok" };
    }
    if (!payload || payload.form_name !== (process.env.FORM_NAME || "cadastro")) return { statusCode: 200, body: "ignorado" };
    const d = payload.data || {};
    const whats = String(d.whatsapp || "").replace(/\D/g, "");
    // veio pelo convite de alguém com conta: conta como amigo convidado
    const ref = String(d.indicado_por || "").replace(/[^a-f0-9]/g, "").slice(0, 10);
    if (ref) {
      try {
        const b = await import("@netlify/blobs");
        if (b.connectLambda) b.connectLambda(event);
        const st = b.getStore({ name: "contas", consistency: "strong" });
        const login = await st.get(`id:${ref}`);
        const chave = login && `u:${encodeURIComponent(login)}`;
        const c = chave && (await st.get(chave, { type: "json" }));
        if (c) { c.convidados = (c.convidados || 0) + 1; await st.setJSON(chave, c); }
      } catch {}
    }
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
