// Kiiro — anúncios aprovados pelo painel (aba Anúncios).
// O site junta estes com os de patrocinios.js. Endereço: /.netlify/functions/patrocinios
import { getStore } from "@netlify/blobs";

export default async () => {
  let lista = {};
  try { lista = (await getStore("admin").get("anuncios", { type: "json" })) || {}; } catch {}
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const ativos = Object.values(lista)
    .filter((a) => a && !a.pausado && (!a.ate || a.ate >= hoje))
    .map(({ nome, categoria, alvoCidade, cidade, texto, botao, link, banner, cor, ate, local }) => ({ nome, categoria, alvoCidade, cidade, texto, botao, link, banner, cor, ate, local }));
  return new Response(JSON.stringify(ativos), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
};
