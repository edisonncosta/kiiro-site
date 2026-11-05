// Kiiro — transforma um endereço em ponto no mapa (para patrocinadores colocados à mão em patrocinios.js com "endereco").
// GET /.netlify/functions/geo?q=Rodovia ERS-030, 95, Osório  →  { local: [lat, lon] } ou { local: null }
// Guarda o resultado (store "geo") para não perguntar de novo.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { localDe } from "../lib/local.mjs";

export default async (req) => {
  const q = String(new URL(req.url).searchParams.get("q") || "").trim().slice(0, 200);
  const json = (o) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } });
  if (q.length < 5) return json({ local: null });
  const st = getStore("geo"), k = crypto.createHash("sha1").update(q.toLowerCase()).digest("hex");
  const salvo = await st.get(k, { type: "json" }).catch(() => null);
  if (salvo) return json(salvo);
  const local = await localDe(q);
  const r = { local };
  if (local) await st.setJSON(k, r).catch(() => {});
  return json(r);
};
