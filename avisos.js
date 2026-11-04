// Kiiro — ativar avisos no celular (usado por avisos.html e pela página inicial).
(function () {
  const ua = navigator.userAgent || "";
  const ehIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalado = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const suporta = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const b64 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };

  async function registro() {
    if (!("serviceWorker" in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration("/")) || navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }

  // "ativo" | "negado" | "instalar" (iPhone fora da tela de início) | "pode" | "sem-suporte"
  async function estado() {
    if (ehIOS && !instalado()) return "instalar";
    if (!suporta()) return "sem-suporte";
    if (Notification.permission === "denied") return "negado";
    try { const r = await registro(); const s = r && (await r.pushManager.getSubscription()); if (s && Notification.permission === "granted") return "ativo"; } catch {}
    return "pode";
  }

  async function ativar(tipo, whats) {
    const e = await estado();
    if (e === "instalar" || e === "sem-suporte" || e === "negado") return e;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return perm === "denied" ? "negado" : "cancelado";
    const r = await registro(); await navigator.serviceWorker.ready;
    const { chave } = await (await fetch("/.netlify/functions/push")).json();
    let s = await r.pushManager.getSubscription();
    if (!s) s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(chave) });
    const resp = await fetch("/.netlify/functions/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "inscrever", sub: s.toJSON(), tipo, whats }) });
    if (!resp.ok) throw new Error("Não deu para salvar (" + resp.status + ")");
    try { localStorage.setItem("kiiro-avisos", JSON.stringify({ tipo, whats, em: Date.now() })); localStorage.removeItem("kiiro-avisos-quero"); } catch {}
    return "ativo";
  }

  async function desativar() {
    try {
      const r = await registro(); const s = r && (await r.pushManager.getSubscription());
      if (s) { await fetch("/.netlify/functions/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "sair", endpoint: s.endpoint }) }); await s.unsubscribe(); }
    } catch {}
    try { localStorage.removeItem("kiiro-avisos"); } catch {}
  }

  window.kiiroAvisos = { estado, ativar, desativar, ehIOS, instalado, suporta };
  // mantém o service worker registrado para os avisos chegarem
  if ("serviceWorker" in navigator && !window.KIIRO_DEMO) registro().catch(() => {});
})();
