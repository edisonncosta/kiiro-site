// Kiiro — notificações no celular pelo site (Web Push), sem pacote extra.
// As chaves VAPID se criam sozinhas na primeira vez e ficam no Blobs (store "push", chave "vapid").
// Inscrições: store "push", chaves "sub-<hash>" → { sub, tipo: "pro" | "cliente", whats, criado }
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
export const soDigitos = (s) => String(s || "").replace(/\D/g, "");
export const normWhats = (s) => { let w = soDigitos(s); if (w.length === 10 || w.length === 11) w = "55" + w; return w.length >= 12 && w.length <= 13 ? w : ""; };

const loja = () => getStore({ name: "push", consistency: "strong" });

let VAPID = null;
export async function chavesVapid() {
  if (VAPID) return VAPID;
  const st = loja();
  let jwk = await st.get("vapid", { type: "json" });
  if (!jwk) {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    jwk = privateKey.export({ format: "jwk" });
    await st.setJSON("vapid", jwk);
    const salvo = await st.get("vapid", { type: "json" }); // se duas funções criaram juntas, vale a que ficou salva
    if (salvo) jwk = salvo;
  }
  const privada = crypto.createPrivateKey({ key: jwk, format: "jwk" });
  const publica = b64u(Buffer.concat([Buffer.from([4]), deB64u(jwk.x), deB64u(jwk.y)]));
  VAPID = { privada, publica };
  return VAPID;
}

// JWT ES256 para o serviço de push saber que o aviso veio da Kiiro
function jwtVapid(endpoint, privada, sujeito) {
  const aud = new URL(endpoint).origin;
  const cab = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const corpo = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujeito }));
  const ass = crypto.sign("sha256", Buffer.from(`${cab}.${corpo}`), { key: privada, dsaEncoding: "ieee-p1363" });
  return `${cab}.${corpo}.${b64u(ass)}`;
}

// criptografia do conteúdo (RFC 8291, aes128gcm)
export function cifrar(texto, p256dh, auth) {
  const uaPub = deB64u(p256dh), segredo = deB64u(auth);
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const comp = ecdh.computeSecret(uaPub);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", comp, segredo, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32));
  const sal = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, sal, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, sal, Buffer.from("Content-Encoding: nonce\0"), 12));
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const cifrado = Buffer.concat([c.update(Buffer.concat([Buffer.from(texto), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([sal, rs, Buffer.from([asPub.length]), asPub, cifrado]);
}

// manda um aviso para uma inscrição. Devolve "ok", "sumiu" (aparelho desinscrito) ou "erro"
export async function enviarUm(sub, msg) {
  try {
    const { privada, publica } = await chavesVapid();
    const site = (process.env.URL || "https://chamakiiro.netlify.app").replace(/\/$/, "");
    const corpo = cifrar(JSON.stringify(msg), sub.keys.p256dh, sub.keys.auth);
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwtVapid(sub.endpoint, privada, site)}, k=${publica}`,
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
        TTL: "86400", Urgency: "high",
      },
      body: corpo,
    });
    if (r.status === 404 || r.status === 410) return "sumiu";
    if (!r.ok) { console.log("push", r.status, (await r.text()).slice(0, 200)); return "erro"; }
    return "ok";
  } catch (e) { console.log("push falhou", e && e.message); return "erro"; }
}

export async function inscricoes() {
  const st = loja();
  const chaves = (await st.list({ prefix: "sub-" })).blobs.map((b) => b.key);
  const l = await Promise.all(chaves.map(async (k) => ({ k, ...((await st.get(k, { type: "json" })) || {}) })));
  return l.filter((x) => x.sub && x.sub.endpoint);
}
export const chaveDe = (endpoint) => "sub-" + crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 32);
export async function salvarInscricao(sub, tipo, whats) {
  await loja().setJSON(chaveDe(sub.endpoint), { sub, tipo, whats, criado: new Date().toISOString() });
}
export async function removerInscricao(endpoint) { await loja().delete(chaveDe(endpoint)); }

// envia para quem bate com o filtro: { tipo, whats } (cada campo é opcional). msg: { title, body, url, tag }
export async function enviarPara(filtro, msg) {
  let lista = [];
  try { lista = await inscricoes(); } catch { return 0; }
  const w = filtro.whats ? normWhats(filtro.whats) : "";
  if (filtro.whats && !w) return 0;
  const alvo = lista.filter((x) => (!filtro.tipo || x.tipo === filtro.tipo) && (!w || x.whats === w));
  let ok = 0;
  await Promise.all(alvo.map(async (x) => {
    const r = await enviarUm(x.sub, msg);
    if (r === "ok") ok++;
    if (r === "sumiu") { try { await loja().delete(x.k); } catch {} }
  }));
  return ok;
}
