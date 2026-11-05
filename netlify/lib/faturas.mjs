// Kiiro — faturas dos anúncios (cobrança mensal por Pix).
// Fica tudo no Netlify Blobs: loja "admin", chave "faturas" = { id: fatura }.
// Status: pendente (esperando o Pix) · informado (a empresa tocou em "Já paguei") · pago (você confirmou) · cancelada
import { getStore } from "@netlify/blobs";

const TZ = "America/Sao_Paulo";
export const diaSP = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ }); // AAAA-MM-DD
export const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const somaMeses = (iso, n) => {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
};
export const br = (iso) => String(iso || "").split("-").reverse().join("/");
export const reais = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
export const NOMES = { servico_cidade: "Serviço na cidade", cidade: "Cidade inteira", servico: "Serviço no litoral", inicio: "Página inicial", temporada: "Pacote Temporada" };
const CHAVE_PRECO = { servico_cidade: "servicoCidade", cidade: "cidade", servico: "servico", inicio: "inicio", temporada: "temporada" };

const loja = () => getStore("admin");
export async function lerFaturas() { return (await loja().get("faturas", { type: "json" })) || {}; }
export async function salvarFaturas(f) { await loja().setJSON("faturas", f); }

// código curto, só letras e números (também vai no Pix como identificador: aparece no extrato)
export function novoId() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "KI";
  for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
export const idValido = (id) => /^KI[A-Z0-9]{6,20}$/.test(String(id || ""));

// preços e chave Pix: os mesmos do site (patrocinios.js)
export async function lerPrecos(site) {
  try {
    const js = await (await fetch(`${site}/patrocinios.js`)).text();
    const precos = {};
    const m = js.match(/KIIRO_PRECOS\s*=\s*\{([^}]*)\}/);
    if (m) for (const [, k, , v] of m[1].matchAll(/(\w+)\s*:\s*("?)([^,"]+)\2/g)) precos[k] = isNaN(+v) ? v.trim() : +v;
    const pix = (js.match(/KIIRO_PIX\s*=\s*\{[^}]*chave:\s*"([^"]*)"/) || [])[1] || "";
    const titular = (js.match(/KIIRO_PIX\s*=\s*\{[^}]*titular:\s*"([^"]*)"/) || [])[1] || "";
    return { precos, pix, titular };
  } catch { return { precos: {}, pix: "", titular: "" }; }
}
// valor mensal de um formato (o Pacote Temporada é valor fechado)
export function valorDe(precos, formato, meses = 1) {
  const v = precos[CHAVE_PRECO[formato]];
  if (typeof v === "number") return v * (formato === "temporada" ? 1 : Math.max(1, meses));
  const n = parseFloat(String(v || "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export function referencia(inicio, meses) {
  const fim = somaDias(somaMeses(inicio, Math.max(1, meses)), -1);
  return { inicio, fim, texto: `${br(inicio)} a ${br(fim)}` };
}

// dados que a página pública pode ver (sem WhatsApp nem observações)
export const publica = (f) => f && ({ id: f.id, empresa: f.empresa, valor: f.valor, descricao: f.descricao, periodo: f.periodo, vence: f.vence, status: f.status });

export async function avisarNoCelular({ title, message, click, tags }) {
  if (!process.env.NTFY_TOPIC) return;
  try {
    await fetch("https://ntfy.sh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: process.env.NTFY_TOPIC, title, message, click, tags }),
    });
  } catch {}
}
