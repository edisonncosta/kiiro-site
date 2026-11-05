// Kiiro — transforma o endereço da loja (ou um link do Google Maps, ou "lat, lon") em ponto no mapa.
// Usa o OpenStreetMap (Nominatim), gratuito. Devolve [lat, lon] ou null.
const noLitoral = ([la, lo]) => la > -31.6 && la < -28.9 && lo > -51.6 && lo < -49.4;

export function coordsDoTexto(t) {
  t = String(t || "");
  const m = t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ||
    t.match(/[?&](?:q|ll|query|center)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i) || t.match(/^\s*(-?\d{1,2}\.\d{3,})\s*[,;]\s*(-?\d{1,3}\.\d{3,})\s*$/);
  if (!m) return null;
  const c = [Number(m[1]), Number(m[2])];
  return c.every(Number.isFinite) ? c : null;
}

export async function localDe(texto) {
  const t = String(texto || "").trim().slice(0, 300);
  if (!t) return null;
  const direto = coordsDoTexto(t);
  if (direto) return direto;
  // link curto do Google Maps (maps.app.goo.gl): segue o redirecionamento e procura as coordenadas
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google|www\.google\.[a-z.]+\/maps)/i.test(t)) {
    try { const r = await fetch(t, { redirect: "follow", signal: AbortSignal.timeout(5000) }); const c = coordsDoTexto(r.url) || coordsDoTexto(await r.text()); if (c) return c; } catch {}
    return null;
  }
  const busca = async (q) => {
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&viewbox=-51.6,-28.9,-49.4,-31.6&q=${encodeURIComponent(q)}`;
    const r = await fetch(u, { headers: { "User-Agent": "Kiiro/1.0 (https://chamakiiro.netlify.app)" }, signal: AbortSignal.timeout(6000) });
    const j = r.ok ? await r.json() : [];
    const c = j[0] ? [Number(j[0].lat), Number(j[0].lon)] : null;
    return c && c.every(Number.isFinite) && noLitoral(c) ? c : null;
  };
  try {
    return (await busca(/rs|rio grande do sul/i.test(t) ? t : `${t}, Rio Grande do Sul`)) ||
      // se não achou o número da rua, tenta sem ele
      (await busca(t.replace(/,?\s*(n[º°o.]?\s*)?\d+\b/gi, "") + ", Rio Grande do Sul"));
  } catch { return null; }
}
