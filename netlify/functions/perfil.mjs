// Kiiro — avaliações públicas de um profissional (para a janela de perfil).
// Endereço: /.netlify/functions/perfil?id=ID_DO_CADASTRO
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return json(400, { erro: "Falta o id" });

  const store = getStore("avaliacoes");
  const { blobs } = await store.list();
  const todas = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);

  const dele = todas
    .filter((a) => a.profissionalId === id && a.feito === "sim" && a.nota >= 1)
    .sort((a, b) => (a.data < b.data ? 1 : -1));

  const distribuicao = [0, 0, 0, 0, 0];
  dele.forEach((a) => distribuicao[a.nota - 1]++);

  const avaliacoes = dele.slice(0, 30).map((a) => ({
    nome: String(a.clienteNome || "Cliente").split(" ")[0], // só o primeiro nome
    nota: a.nota,
    comentario: a.comentario || "",
    data: a.data,
  }));

  return json(200, { total: dele.length, distribuicao, avaliacoes }, { "Cache-Control": "public, max-age=120" });
};

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
}
