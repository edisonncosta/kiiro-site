// Kiiro — transforma a localização do celular em rua, bairro e cidade.
// Endereço: /.netlify/functions/onde?lat=-29.98&lon=-50.13
// Usa o OpenStreetMap (Nominatim), gratuito. Nada é guardado.
export default async (req) => {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat")), lon = Number(u.searchParams.get("lon"));
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ erro: "local" }, 400);
  const api = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=pt-BR&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
  try {
    const r = await fetch(api, { headers: { "User-Agent": "Kiiro/1.0 (https://chamakiiro.netlify.app)" }, signal: AbortSignal.timeout(4500) });
    if (!r.ok) return json({ erro: "servico" }, 502);
    const a = (await r.json()).address || {};
    return json({
      rua: a.road || a.pedestrian || "",
      bairro: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.hamlet || "",
      cidade: a.city || a.town || a.village || a.municipality || "",
      estado: a.state || "",
    });
  } catch {
    return json({ erro: "servico" }, 502);
  }
};
