// Kiiro — link para o profissional pedir avaliações, com prévia bonita no WhatsApp.
//   /i/ID            → página com título e imagem do profissional (o WhatsApp lê) e leva a pessoa para avaliar
//   /i/ID/foto.jpg   → a imagem "Me avalie na Kiiro" com a foto dele
// ID pode ser o id do cadastro ou "w" + WhatsApp (ex.: /i/w5551999999999).
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { montarImagem } from "../lib/og.mjs";

// /d/ID → o mesmo, mas para pedir doação (abre a janela "Doe" do site)
export const config = { path: ["/i/:id", "/i/:id/foto.jpg", "/d/:id", "/d/:id/foto.jpg"] };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 10);

async function acharPro(base, id) {
  let pros = [];
  try { pros = await (await fetch(`${base}/.netlify/functions/profissionais`)).json(); } catch {}
  if (!Array.isArray(pros)) return null;
  const w = /^w\d{10,13}$/.test(id) ? id.slice(1) : "";
  return pros.find((p) => w ? String(p.whatsapp || "").endsWith(w.slice(-9)) : String(p.id) === id || (p.ids || []).map(String).includes(id)) || null;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const base = url.origin;
  const id = String((context && context.params && context.params.id) || url.pathname.split("/")[2] || "").replace(/[^\w-]/g, "").slice(0, 60);
  const ehImagem = url.pathname.endsWith("/foto.jpg");
  const doacao = url.pathname.startsWith("/d/");
  const p = id ? await acharPro(base, id) : null;

  if (ehImagem) {
    const foto = p && p.foto ? (p.foto.startsWith("/") ? base + p.foto : p.foto) : "";
    const chave = `${doacao ? "doe" : "av"}-${p ? p.id : "kiiro"}-${hash(foto)}`; // "av-": imagem nova (avaliação), não reaproveita a antiga
    const st = getStore("og");
    let img = await st.get(chave, { type: "arrayBuffer" }).catch(() => null);
    if (!img) {
      let bytes = null;
      if (foto) { try { const r = await fetch(foto); if (r.ok) bytes = Buffer.from(await r.arrayBuffer()); } catch {} }
      const pronto = montarImagem(bytes, doacao ? "doacao" : "avaliacao");
      img = pronto.buffer.slice(pronto.byteOffset, pronto.byteOffset + pronto.length);
      try { await st.set(chave, img); } catch {}
    }
    return new Response(img, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
  }

  const destino = doacao ? "/#doe" : p ? `/#indicar-${encodeURIComponent(p.id)}` : "/";
  // nome inteiro quando é curto (empresa: "Borracharia N.S. Aparecida"); senão nome e sobrenome
  const partes = p ? String(p.nome).trim().split(/\s+/) : [];
  const nome = partes.join(" ").length <= 26 ? partes.join(" ") : partes.slice(0, 2).join(" ");
  const serv = p && p.categorias && p.categorias[0] ? p.categorias[0] : "";
  const servTxt = serv && !nome.toLowerCase().includes(serv.toLowerCase()) ? ` (${serv.toLowerCase()})` : "";
  const titulo = doacao ? "Apoie a Kiiro 💛" : p ? `Avalie ${nome} na Kiiro ⭐` : "Kiiro · Profissionais do Litoral Norte";
  const desc = doacao ? "A Kiiro é grátis para profissionais e se mantém com doações. Qualquer valor ajuda, pelo Pix em 1 minuto."
    : p ? `${nome}${servTxt} pede sua avaliação. Já fez serviço ou conhece o trabalho? Leva 1 minuto.` : "Profissionais perto de você no Litoral Norte do RS.";
  const pasta = doacao ? "d" : "i";
  const imagem = p ? `${base}/${pasta}/${encodeURIComponent(p.id)}/foto.jpg?v=${doacao ? "doe" : "av"}${hash(p.foto || "")}` : `${base}/img/og-kiiro.jpg`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Kiiro">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(base + url.pathname)}">
<meta property="og:image" content="${esc(imagem)}"><meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(imagem)}">
<meta http-equiv="refresh" content="0;url=${esc(destino)}">
<style>body{font-family:system-ui,sans-serif;background:#FFFAEA;display:grid;place-items:center;min-height:100vh;margin:0}a{color:#1A1A1A;font-weight:600}</style>
</head><body><p>Abrindo a Kiiro… <a href="${esc(destino)}">toque aqui</a></p>
<script>location.replace(${JSON.stringify(destino)})</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
};
