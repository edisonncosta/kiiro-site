// Kiiro — foto do cadastro do profissional, servida pelo próprio site.
// Endereço: /.netlify/functions/foto-pro?id=ID_DO_CADASTRO&c=foto (ou trabalho1, trabalho2, trabalho3)
// Na primeira vez busca o arquivo no Netlify Forms (com o endereço novo, que não vence) e guarda uma cópia;
// depois serve a cópia guardada. Assim a foto não some quando o link do Netlify expira.
import { getStore } from "@netlify/blobs";

const API = "https://api.netlify.com/api/v1";
const CAMPOS = new Set(["foto", "trabalho1", "trabalho2", "trabalho3"]);
const urlDe = (f) => (f && (f.url || (typeof f === "string" && /^https?:/.test(f) ? f : ""))) || "";

export default async (req) => {
  const u = new URL(req.url);
  const id = String(u.searchParams.get("id") || "");
  const c = String(u.searchParams.get("c") || "foto");
  if (!/^[a-f0-9]{24}$/i.test(id) || !CAMPOS.has(c)) return new Response("Pedido inválido", { status: 400 });

  const store = getStore("fotos-cadastro");
  const chave = `${id}-${c}`;
  try {
    const guardada = await store.get(chave, { type: "arrayBuffer" });
    if (guardada && guardada.byteLength) return imagem(guardada, tipoDe(guardada));
  } catch {}

  const { NETLIFY_TOKEN } = process.env;
  if (!NETLIFY_TOKEN) return new Response("Falta NETLIFY_TOKEN", { status: 500 });
  try {
    const rs = await fetch(`${API}/submissions/${id}`, { headers: { Authorization: `Bearer ${NETLIFY_TOKEN}` } });
    if (!rs.ok) return new Response(`Cadastro não encontrado (${rs.status})`, { status: 404 });
    const s = await rs.json();
    const link = urlDe((s.data || {})[c]);
    if (!link) return new Response("Sem foto neste cadastro", { status: 404 });
    const rf = await fetch(link);
    if (!rf.ok) return new Response(`Arquivo não abriu (${rf.status})`, { status: 502 });
    const tipo = rf.headers.get("content-type") || "image/jpeg";
    if (!/^image\//.test(tipo)) return new Response(`Arquivo não é imagem (${tipo})`, { status: 415 });
    const bytes = await rf.arrayBuffer();
    try { await store.set(chave, bytes); } catch {}
    return imagem(bytes, tipo);
  } catch (e) {
    return new Response("Falhou ao buscar a foto", { status: 502 });
  }
};

// tipo da imagem pelos primeiros bytes (jpeg, png, webp, heic)
function tipoDe(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "image/heic";
  return "image/jpeg";
}
const imagem = (bytes, tipo) => new Response(bytes, { headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=604800" } });
