// Kiiro — seu painel: quem chamou quem, e como foi.
// Endereço: /painel?chave=SUA_ADMIN_KEY
import { getStore } from "@netlify/blobs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TZ = "America/Sao_Paulo";
const fmt = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dia = (iso) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ });
const tel = (n) => String(n).replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

export default async (req) => {
  const url = new URL(req.url);
  if (!process.env.ADMIN_KEY || url.searchParams.get("chave") !== process.env.ADMIN_KEY) {
    return new Response("Acesso negado", { status: 401 });
  }
  const filtro = url.searchParams.get("ver") || "todas";
  const base = url.origin;

  const chamadas = getStore("chamadas");
  const avaliacoes = getStore("avaliacoes");
  const chaves = (await chamadas.list()).blobs.map((b) => b.key).sort().reverse().slice(0, 300);
  const avKeys = new Set((await avaliacoes.list()).blobs.map((b) => b.key));
  const itens = (await Promise.all(chaves.map(async (k) => {
    const ch = await chamadas.get(k, { type: "json" });
    if (!ch) return null;
    const av = avKeys.has(k) ? await avaliacoes.get(k, { type: "json" }) : null;
    return { k, ch, av };
  }))).filter(Boolean);

  const hoje = dia(new Date().toISOString());
  const total = itens.length;
  const deHoje = itens.filter((i) => dia(i.ch.data) === hoje).length;
  const avaliadas = itens.filter((i) => i.av).length;
  const pendentes = itens.filter((i) => !i.av).length;
  const ruins = itens.filter((i) => i.av && (i.av.feito === "nao" || i.av.nota <= 2)).length;

  const lista = itens.filter((i) =>
    filtro === "pendentes" ? !i.av : filtro === "atencao" ? i.av && (i.av.feito === "nao" || i.av.nota <= 2) : true);

  const linhas = lista.map(({ k, ch, av }) => {
    const primeiro = ch.clienteNome.split(" ")[0];
    const profPrimeiro = ch.profissionalNome.split(" ")[0];
    const link = `${base}/avaliar?c=${encodeURIComponent(k)}`;
    const msg = `Oi, ${primeiro}! Aqui é da Kiiro 💛 Deu certo com ${profPrimeiro}? Leva 10 segundos para avaliar: ${link}`;
    let status;
    if (!av) status = `<span class="st pend">Aguardando avaliação</span>`;
    else if (av.feito === "nao") status = `<span class="st ruim">Não fechou · ${esc(av.motivo)}</span>`;
    else status = `<span class="st ${av.nota <= 2 ? "ruim" : "bom"}">${"★".repeat(av.nota)}${"☆".repeat(5 - av.nota)} ${av.nota}</span>`;
    return `
    <article>
      <div class="l1"><b>${esc(ch.clienteNome)}</b><span>${fmt(ch.data)}</span></div>
      <p>chamou <b>${esc(ch.profissionalNome)}</b> · ${esc(ch.categoria)} · ${esc(ch.cidade)}</p>
      ${status}
      ${av && av.comentario ? `<blockquote>“${esc(av.comentario)}”</blockquote>` : ""}
      <div class="acoes">
        ${!av ? `<a class="b zap" href="https://wa.me/${esc(ch.clienteWhatsapp)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Pedir avaliação</a>` : ""}
        <a class="b" href="https://wa.me/${esc(ch.clienteWhatsapp)}" target="_blank" rel="noopener">${tel(esc(ch.clienteWhatsapp))}</a>
      </div>
    </article>`;
  }).join("");

  const aba = (v, t, n) => `<a class="aba ${filtro === v ? "on" : ""}" href="?chave=${encodeURIComponent(process.env.ADMIN_KEY)}&ver=${v}">${t} <small>${n}</small></a>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="theme-color" content="#FFC800"><title>Kiiro · Painel</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Poppins,system-ui,sans-serif;background:#FFFDF5;color:#1A1A1A}
header{background:#FFC800;border-bottom:2px solid #1A1A1A;padding:18px}
header h1{font-size:22px;font-weight:800}
.nums{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.nums div{background:#fff;border:2px solid #1A1A1A;border-radius:14px;padding:8px;text-align:center}
.nums b{display:block;font-size:20px}.nums span{font-size:11px;font-weight:600}
.abas{display:flex;gap:8px;padding:14px 14px 0;overflow-x:auto}
.aba{flex:none;border:2px solid #1A1A1A;border-radius:999px;padding:6px 14px;font-weight:600;font-size:14px;text-decoration:none;color:#1A1A1A;background:#fff}
.aba.on{background:#1A1A1A;color:#FFC800}
main{padding:14px;max-width:640px;margin:auto}
article{background:#fff;border:2px solid #1A1A1A;border-radius:18px;padding:14px;margin-bottom:12px}
.l1{display:flex;justify-content:space-between;gap:8px}.l1 span{color:#5A5339;font-size:13px}
article p{margin:4px 0 8px;font-size:15px}
.st{display:inline-block;font-size:13px;font-weight:700;border-radius:999px;padding:3px 10px}
.pend{background:#FFF1B8}.bom{background:#DDF3E4;color:#0E5C2C}.ruim{background:#FFE4DE;color:#8A1C0E}
blockquote{margin-top:8px;font-size:14px;color:#5A5339;border-left:3px solid #FFC800;padding-left:10px}
.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.b{display:inline-block;border:2px solid #1A1A1A;border-radius:10px;padding:7px 12px;font-weight:600;font-size:14px;text-decoration:none;color:#1A1A1A}
.b.zap{background:#168A45;border-color:#168A45;color:#fff}
.vazio{text-align:center;color:#5A5339;padding:40px 0}
</style></head><body>
<header>
  <h1>Painel da Kiiro</h1>
  <div class="nums">
    <div><b>${deHoje}</b><span>hoje</span></div>
    <div><b>${total}</b><span>chamadas</span></div>
    <div><b>${avaliadas}</b><span>avaliadas</span></div>
    <div><b>${ruins}</b><span>atenção</span></div>
  </div>
</header>
<nav class="abas">${aba("todas", "Todas", total)}${aba("pendentes", "Pedir avaliação", pendentes)}${aba("atencao", "Atenção", ruins)}</nav>
<main>${linhas || '<p class="vazio">Nada por aqui ainda.</p>'}</main>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
};
