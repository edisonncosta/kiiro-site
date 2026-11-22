// Kiiro — Acontece: a cada 10 min publica os eventos novos da busca automática (ramo "sugestoes"), sem duplicar,
// e tenta de novo achar a imagem dos que estão no ar sem foto (arte do link ou print da página).
import { publicarSugestoes, completarImagens } from "../lib/acontece-auto.mjs";
export const config = { schedule: "*/10 * * * *" };
export default async () => {
  const t0 = Date.now();
  const n = await publicarSugestoes(process.env.URL || "https://chamakiiro.com.br", { forcar: true }).catch(() => 0);
  const f = await completarImagens({ ate: Math.max(4000, 24000 - (Date.now() - t0)) }).catch(() => 0);
  return new Response(`publicados: ${n} · imagens achadas: ${f}`);
};
