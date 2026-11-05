// Kiiro — pagamento por Pix das faturas de anúncio (usado em anuncio-ok.html e pagar.html).
// Precisa de patrocinios.js (KIIRO_PIX) e qrcode.js carregados antes.
(function () {
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  // "Pix Copia e Cola" (BR Code do Banco Central). txid = código da fatura, aparece no seu extrato.
  function pixPayload(chave, valor, nome, cidade, txid) {
    const tlv = (id, v) => id + String(v.length).padStart(2, "0") + v;
    const limpo = (s, n) => sem(s).toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().slice(0, n) || "KIIRO";
    const corpo = tlv("00", "01") +
      tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", chave)) +
      tlv("52", "0000") + tlv("53", "986") +
      (valor ? tlv("54", Number(valor).toFixed(2)) : "") +
      tlv("58", "BR") + tlv("59", limpo(nome, 25)) + tlv("60", limpo(cidade, 15)) +
      tlv("62", tlv("05", String(txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***")) + "6304";
    let crc = 0xFFFF;
    for (const ch of corpo) { crc ^= ch.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; }
    return corpo + crc.toString(16).toUpperCase().padStart(4, "0");
  }
  const reais = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
  const br = (iso) => String(iso || "").split("-").reverse().join("/");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const CSS = `
  .pg-box{max-width:26rem;margin:0 auto;background:var(--card);border:1.5px solid var(--line);border-radius:22px;padding:1.2rem;text-align:left;box-shadow:0 6px 24px rgba(90,70,0,.08)}
  .pg-topo{display:flex;justify-content:space-between;align-items:flex-start;gap:.8rem}
  .pg-topo small{display:block;color:var(--muted);font-size:.8rem}
  .pg-topo b{display:block;font-size:1.05rem;line-height:1.25}
  .pg-valor{font-size:1.7rem;font-weight:800;white-space:nowrap;line-height:1}
  .pg-st{display:inline-block;font-size:.75rem;font-weight:700;border-radius:999px;padding:.2rem .7rem;margin-top:.5rem}
  .pg-st.pendente{background:#FFF3C4;color:#7A5B00}.pg-st.informado{background:#E3EEFF;color:#1A4FD6}.pg-st.pago,.pg-st.cortesia{background:#DFF3E5;color:#0B5E30}
  .pg-qr{display:block;width:220px;height:220px;margin:1rem auto .4rem;image-rendering:pixelated;border-radius:12px;background:#fff}
  .pg-dica{text-align:center;font-size:.82rem;color:var(--muted);margin:0 0 .8rem}
  .pg-cod{background:var(--sun-soft);border-radius:12px;padding:.6rem .7rem;font:500 .72rem/1.4 ui-monospace,Menlo,monospace;word-break:break-all;max-height:4.4em;overflow:hidden;color:#555}
  .pg-box .btn{width:100%;margin-top:.6rem}
  .pg-ok{text-align:center;padding:.6rem 0 .2rem}
  .pg-ok b{display:block;font-size:1.15rem;margin-bottom:.3rem}
  .pg-ok p{margin:0;color:var(--muted);font-size:.92rem}
  .pg-erro{color:#B3261E;font-weight:600;font-size:.9rem;margin-top:.5rem;text-align:center}`;

  function montar(el, fatura, opcoes = {}) {
    if (!document.getElementById("pg-css")) { const s = document.createElement("style"); s.id = "pg-css"; s.textContent = CSS; document.head.appendChild(s); }
    const pix = window.KIIRO_PIX || {};
    const f = fatura;
    const rotulo = { pendente: "Aguardando pagamento", informado: "Pagamento informado · a Kiiro está conferindo", pago: "Pago ✓", cortesia: "Cortesia da Kiiro 💛" }[f.status] || f.status;
    const topo = `<div class="pg-topo"><div><small>Fatura ${esc(f.id)}${f.vence ? " · vence " + br(f.vence) : ""}</small><b>${esc(f.empresa)}</b><small>${esc(f.descricao || "")}${f.periodo ? "<br>" + esc(f.periodo) : ""}</small><span class="pg-st ${esc(f.status)}">${esc(rotulo)}</span></div><div class="pg-valor">${reais(f.valor)}</div></div>`;
    if (f.status === "cortesia") { el.innerHTML = `<div class="pg-box">${topo}<div class="pg-ok"><b>Este período é cortesia da Kiiro 💛</b><p>Nada a pagar. Obrigado por apoiar a Kiiro!</p></div></div>`; return; }
    if (f.status === "pago") { el.innerHTML = `<div class="pg-box">${topo}<div class="pg-ok"><b>Pagamento confirmado 💛</b><p>Obrigado pela parceria! Seu anúncio está garantido neste período.</p></div></div>`; return; }
    if (f.status === "informado") { el.innerHTML = `<div class="pg-box">${topo}<div class="pg-ok"><b>Recebemos seu aviso!</b><p>A Kiiro vai conferir o Pix e confirmar. Qualquer coisa a gente chama no seu WhatsApp.</p></div></div>`; return; }
    if (!pix.chave) { el.innerHTML = `<div class="pg-box">${topo}<p class="pg-erro">Pix indisponível no momento. Chame a Kiiro no WhatsApp.</p></div>`; return; }
    const cod = pixPayload(pix.chave, f.valor, pix.titular || "Kiiro", "Litoral Norte", f.id);
    el.innerHTML = `<div class="pg-box">${topo}
      <img class="pg-qr" id="pg-qr" alt="QR Code do Pix de ${esc(reais(f.valor))}">
      <p class="pg-dica">Abra o app do banco e escaneie, ou copie o código.</p>
      <div class="pg-cod" id="pg-cod">${esc(cod)}</div>
      <button class="btn btn-sun" type="button" id="pg-copiar">Copiar código Pix</button>
      <button class="btn btn-ink" type="button" id="pg-paguei">Já paguei</button>
      <p class="pg-erro" id="pg-erro" hidden></p></div>`;
    try { const q = window.qrcode(0, "M"); q.addData(cod); q.make(); el.querySelector("#pg-qr").src = q.createDataURL(8, 2); } catch { el.querySelector("#pg-qr").remove(); }
    el.querySelector("#pg-copiar").onclick = async (e) => {
      try { await navigator.clipboard.writeText(cod); e.target.textContent = "Código copiado ✓"; }
      catch { e.target.textContent = "Segure o código acima para copiar"; }
    };
    el.querySelector("#pg-paguei").onclick = async (e) => {
      const b = e.target; b.disabled = true; b.textContent = "Avisando a Kiiro…";
      try {
        if (opcoes.demo) { montar(el, { ...f, status: "informado" }, opcoes); return; }
        const r = await fetch("/.netlify/functions/fatura", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "paguei", id: f.id }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.erro || "erro");
        montar(el, d, opcoes);
        if (opcoes.aoPagar) opcoes.aoPagar(d);
      } catch {
        b.disabled = false; b.textContent = "Já paguei";
        const er = el.querySelector("#pg-erro"); er.hidden = false; er.textContent = "Não deu para avisar agora. Tente de novo ou mande o comprovante no WhatsApp.";
      }
    };
  }
  window.KiiroPagar = { montar, pixPayload, reais };
})();
