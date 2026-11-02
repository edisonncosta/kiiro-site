// Kiiro — mostra a foto de uma avaliação. Endereço: /.netlify/functions/foto?id=ID
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Não encontrada", { status: 404 });
  const dados = await getStore("fotos").get(id, { type: "arrayBuffer" });
  if (!dados) return new Response("Não encontrada", { status: 404 });
  return new Response(dados, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
};
