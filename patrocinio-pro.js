// Kiiro — "Seu cadastro é grátis, patrocinado por…" (cadastro do profissional e tela de cadastro recebido).
// Escolhe o patrocinador pela cidade e pelo serviço do profissional, na mesma ordem do site:
// serviço na cidade → cidade inteira → serviço no litoral → página inicial.
// Precisa de servicos.js e patrocinios.js carregados antes.
(function () {
  const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const GRUPO = {};
  (window.KIIRO_SERVICOS || []).forEach((g) => g.itens.forEach((i) => (GRUPO[i] = g.grupo)));
  let lista = null;
  async function carregar() {
    if (lista) return lista;
    const hoje = new Date().toISOString().slice(0, 10);
    let extras = [];
    if (!window.KIIRO_DEMO) { try { const r = await fetch("/.netlify/functions/patrocinios"); if (r.ok) extras = await r.json(); } catch {} }
    lista = [...(window.KIIRO_PATROCINIOS || []), ...(Array.isArray(extras) ? extras : [])].filter((x) => x && (!x.ate || x.ate >= hoje));
    return lista;
  }
  const ehInicio = (x) => x.categoria === "Todos" || x.categoria === "Página inicial";
  const daCidade = (x, c) => !!x.alvoCidade && !!c && sem(x.alvoCidade) === sem(c);
  const doServico = (x, servs) => servs.some((s) => x.categoria === s || x.categoria === GRUPO[s]);
  function escolher(a, servs, cidade) {
    const niveis = [];
    if (cidade && servs.length) niveis.push(a.filter((x) => doServico(x, servs) && daCidade(x, cidade)));
    if (cidade) niveis.push(a.filter((x) => ehInicio(x) && daCidade(x, cidade)));
    if (servs.length) niveis.push(a.filter((x) => doServico(x, servs) && !x.alvoCidade));
    niveis.push(a.filter((x) => ehInicio(x) && !x.alvoCidade));
    const n = niveis.find((l) => l.length) || [];
    return n.length ? n[Math.floor(Math.random() * n.length)] : null;
  }
  const CSS = `
  .pp{max-width:34rem;margin:1.6rem auto 0;text-align:left}
  .pp-rot{font-size:.8rem;color:#6A6A6A;margin:0 0 .45rem .2rem}
  .pp-rot b{color:#1A1A1A}
  .pp-ban{position:relative;display:flex;gap:.7rem;align-items:stretch;min-height:150px;padding:.7rem;border-radius:10px;overflow:hidden;text-decoration:none;color:#1A1A1A;background:#FFC800;box-shadow:0 6px 20px rgba(150,110,0,.18)}
  .pp-ban > *{position:relative;z-index:1}
  .pp-fundo{position:absolute!important;inset:0;z-index:0!important;background:#FFC800}
  .pp-img{flex:0 0 56%;border-radius:6px;background:#fff center/contain no-repeat;display:grid;place-items:center;padding:.8rem;text-align:center;font-weight:800;font-size:1.15rem;line-height:1.15}
  .pp-img.cheio{padding:0}
  .pp-img small{display:block;margin-top:.4rem;font-size:.78rem;font-weight:500;color:#4A3D00}
  .pp-dir{flex:1;min-width:0;display:flex;align-items:center;justify-content:center}
  .pp-bt{width:100%;display:grid;place-items:center;text-align:center;background:#fff;color:#1F3FBF;border-radius:6px;padding:.8rem .6rem;font-weight:700;font-size:.9rem;line-height:1.2;box-shadow:0 3px 10px rgba(0,0,0,.12)}
  .pp-tag{position:absolute!important;z-index:2!important;right:.7rem;top:.5rem;background:rgba(26,26,26,.82);color:#fff;border-radius:3px;padding:.1rem .5rem;font-size:.6rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .pp-ban.livre .pp-img{background:rgba(255,255,255,.45);border:1.5px dashed rgba(26,26,26,.25)}
  .pp-ban.livre .pp-bt{color:#1A1A1A}`;
  function contar(t, k) {
    if (window.KIIRO_DEMO) return;
    try { if (localStorage.getItem("kiiro-nao-contar") === "1") return; } catch {}
    try { const c = JSON.stringify({ t, k }); if (!(navigator.sendBeacon && navigator.sendBeacon("/.netlify/functions/evento", new Blob([c], { type: "text/plain" })))) fetch("/.netlify/functions/evento", { method: "POST", body: c, keepalive: true }).catch(() => {}); } catch {}
  }
  const coresBanner = new Map();
  function corVivaDe(src) {
    if (coresBanner.has(src)) return coresBanner.get(src);
    const pr = new Promise(ok => {
      const im = new Image();
      im.onload = () => {
        try {
          const N = 48, c = document.createElement("canvas"); c.width = c.height = N;
          const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0, N, N);
          const px = g.getImageData(0, 0, N, N).data, bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
          let total = 0;
          for (let i = 0; i < px.length; i += 4) {
            const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, d = mx - mn;
            if (px[i + 3] < 200 || d < .2 || l < .18 || l > .82) continue;
            const sat = d / (1 - Math.abs(2 * l - 1));
            if (sat < .4) continue;
            let h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4; h = (h * 60 + 360) % 360;
            const k = bins[Math.floor(h / 30) % 12], w = sat * sat;
            k.w += w; k.r += px[i] * w; k.g += px[i + 1] * w; k.b += px[i + 2] * w; total++;
          }
          const top = bins.reduce((a, b) => b.w > a.w ? b : a);
          ok(total >= N * N * .015 && top.w ? vivo([top.r / top.w, top.g / top.w, top.b / top.w]) : null);
        } catch { ok(null); }
      };
      im.onerror = () => ok(null);
      im.src = src;
    });
    coresBanner.set(src, pr);
    return pr;
  }
  // deixa a cor da marca bem viva (média de pixels tende a sair "lavada")
  function vivo([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0, l = (mx + mn) / 2;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360; const s = .78; l = Math.min(.48, Math.max(.36, l));
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [a, bb, cc] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [a, bb, cc].map(v => Math.round((v + m) * 255));
  }
  const misturar = (c, alvo, t) => c.map((v, i) => Math.round(v + (alvo[i] - v) * t));
  const rgb = c => `rgb(${c.join(",")})`;
  async function pintar(el, img) {
    const c = await corVivaDe(img); if (!c) return;
    const claro = misturar(c, [255, 255, 255], .18), escuro = misturar(c, [0, 0, 0], .45);
    el.querySelector(".pp-fundo").style.background = `linear-gradient(135deg, ${rgb(claro)} 0%, ${rgb(c)} 45%, ${rgb(escuro)} 100%)`;
    el.querySelector(".pp-bt").style.color = rgb(misturar(c, [0, 0, 0], .35));
  }
  const vistos = new Set();
  async function mostrar(el, servs, cidade) {
    if (!el) return;
    if (!document.getElementById("pp-css")) { const s = document.createElement("style"); s.id = "pp-css"; s.textContent = CSS; document.head.appendChild(s); }
    servs = (servs || []).filter(Boolean);
    const p = escolher(await carregar(), servs, cidade);
    if (!p) {
      const onde = cidade ? `de ${esc(cidade)}` : "do Litoral Norte";
      el.innerHTML = `<div class="pp"><p class="pp-rot">Seu cadastro na Kiiro é <b>grátis</b>.</p>
        <a class="pp-ban livre" href="anunciar.html${cidade ? "?formato=cidade&cidade=" + encodeURIComponent(cidade) : ""}">
          <span class="pp-fundo" aria-hidden="true"></span>
          <span class="pp-img">📣 Sua marca aqui<small>Patrocine os profissionais ${onde}</small></span>
          <span class="pp-dir"><span class="pp-bt">Quero patrocinar</span></span>
          <span class="pp-tag">Espaço disponível</span>
        </a></div>`;
      return;
    }
    const img = p.banner || p.logo || "";
    if (!vistos.has(p.nome)) { vistos.add(p.nome); contar("patro_ver", p.nome); }
    const fundoImg = /^#[0-9a-f]{3,8}$/i.test(p.cor || "") ? p.cor : "#fff";
    el.innerHTML = `<div class="pp"><p class="pp-rot">Seu cadastro na Kiiro é <b>grátis</b> graças a <b>${esc(p.nome)}</b>.</p>
      <a class="pp-ban" href="${esc(p.link || "#")}" target="_blank" rel="noopener sponsored" aria-label="${esc(p.nome + (p.texto ? ": " + p.texto : ""))}">
        <span class="pp-fundo" aria-hidden="true"></span>
        <span class="pp-img${p.banner ? " cheio" : ""}" style="${img ? `background-color:${fundoImg};background-image:url('${esc(img)}')` : ""}">${img ? "" : esc(p.nome)}</span>
        <span class="pp-dir"><span class="pp-bt">${esc(p.botao || "Conhecer")}</span></span>
        <span class="pp-tag">Patrocinado</span>
      </a></div>`;
    if (img) pintar(el.querySelector(".pp-ban"), img);
    el.querySelector(".pp-ban").addEventListener("click", () => contar("patro_clique", p.nome));
  }
  window.KiiroPatroPro = { mostrar };
})();
