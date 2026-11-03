// Kiiro — avaliações públicas de um profissional (para a janela de perfil).
// Endereço: /.netlify/functions/perfil?id=ID_DO_CADASTRO
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const w = (url.searchParams.get("w") || "").replace(/\D/g, "");
  const ids = new Set((url.searchParams.get("ids") || id).split(",").filter(Boolean));
  if (!id && !w) return json(400, { erro: "Falta o id" });

  const store = getStore("avaliacoes");
  const { blobs } = await store.list();
  const todas = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);

  const dele = todas
    .filter((a) => (ids.has(a.profissionalId) || (w && a.profissionalWhatsapp === w)) && a.feito === "sim" && a.nota >= 1)
    .sort((a, b) => (a.data < b.data ? 1 : -1));

  const distribuicao = [0, 0, 0, 0, 0];
  dele.forEach((a) => distribuicao[a.nota - 1]++);

  const avaliacoes = dele.slice(0, 30).map((a) => ({
    nome: String(a.clienteNome || "Cliente").split(" ")[0], // só o primeiro nome
    nota: a.nota,
    comentario: a.comentario || "",
    foto: a.fotoId ? `/.netlify/functions/foto?id=${a.fotoId}` : "",
    data: a.data,
  }));

  // o que os clientes destacam (só os pontos positivos aparecem no perfil)
  const BONS = ["⏰ Pontual", "✨ Caprichoso", "💰 Preço justo", "🙂 Educado", "🧹 Deixou tudo limpo", "⚡ Resolveu rápido"];
  const destaques = BONS.map((t) => [t, dele.filter((a) => Array.isArray(a.tags) && a.tags.includes(t)).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

  // indicações aprovadas no painel (não contam na nota)
  let indicacoes = [];
  try {
    const st = getStore("indicacoes");
    const { blobs: bi } = await st.list();
    const todasInd = (await Promise.all(bi.map((b) => st.get(b.key, { type: "json" })))).filter(Boolean);
    indicacoes = todasInd
      .filter((x) => x.status === "aprovada" && (ids.has(x.profissionalId) || (w && x.profissionalWhatsapp === w)))
      .sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 20)
      .map((x) => ({ nome: String(x.nome || "").split(" ")[0], relacao: x.relacao, texto: x.texto, data: x.data }));
  } catch {}

  return json(200, { total: dele.length, distribuicao, avaliacoes, destaques, indicacoes }, { "Cache-Control": "public, max-age=120" });
};

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
}
