// Kiiro — mostra uma foto do Acontece. Endereço: /.netlify/functions/acontece-foto?id=ID
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Não encontrada", { status: 404 });
  const dados = await getStore("acontece-fotos").get(id, { type: "arrayBuffer" });
  if (!dados) return new Response("Não encontrada", { status: 404 });
  const b = new Uint8Array(dados.slice(0, 12));
  const tipo = b[0] === 0x89 ? "image/png" : b[8] === 0x57 && b[9] === 0x45 ? "image/webp" : "image/jpeg";
  return new Response(dados, { headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=604800" } });
};
