// Kiiro — Acontece: de hora em hora publica os eventos novos da busca automática (ramo "sugestoes"), sem duplicar.
import { publicarSugestoes } from "../lib/acontece-auto.mjs";
export const config = { schedule: "17 * * * *" };
export default async () => {
  const n = await publicarSugestoes(process.env.URL || "https://chamakiiro.com.br", { forcar: true }).catch(() => 0);
  return new Response(`publicados: ${n}`);
};
