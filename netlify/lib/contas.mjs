// Kiiro — contas (cliente e profissional). Tudo no Netlify Blobs, loja "contas".
//   u:<login>   → a conta (login = e-mail em minúsculas ou telefone com 55)
//   s:<token>   → sessão { login, criado }
//   w:<whats>   → qual conta está ligada a esse WhatsApp de profissional (um por número)
//   f:<login>   → tentativas de senha erradas (trava 15 min depois de 5)
// Senha guardada só como hash (scrypt + sal). Ninguém, nem o painel, vê a senha.
import { getStore } from "@netlify/blobs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const loja = () => getStore({ name: "contas", consistency: "strong" });
export const soDigitos = (s) => String(s || "").replace(/\D/g, "");
export const comPais = (d) => { d = soDigitos(d); return d.length === 10 || d.length === 11 ? "55" + d : d; };
const k = (pre, v) => `${pre}:${encodeURIComponent(v)}`;

// entra com o telefone (o mesmo WhatsApp que puxa os chamados e liga o profissional). Sem e-mail.
export function normalizarLogin(bruto) {
  const d = comPais(bruto);
  return d.length >= 12 && d.length <= 13 ? { login: d, tipo: "tel" } : null;
}
export const telValido = (t) => { const d = comPais(t); return d.length >= 12 && d.length <= 13 ? d : ""; };
// um WhatsApp por conta: t:<numero> → login
export const donoDoTel = (t) => loja().get(k("t", t));
export const ligarTel = (t, login) => loja().set(k("t", t), login);
export const soltarTel = (t) => loja().delete(k("t", t));

// senha forte: 8+ caracteres, letra maiúscula, letra minúscula e número (os mesmos itens que a tela vai marcando)
export const senhaBoa = (s) => typeof s === "string" && s.length >= 8 && s.length <= 100 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s);

export function hashSenha(senha, sal = randomBytes(16).toString("hex")) {
  return { sal, hash: scryptSync(senha, sal, 64).toString("hex") };
}
export function confere(senha, conta) {
  const a = Buffer.from(scryptSync(String(senha), conta.sal, 64).toString("hex"));
  const b = Buffer.from(conta.hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// senha provisória (esqueci a senha): fácil de digitar, vale 48 h, e quem entra com ela é obrigado a trocar
export function novaProvisoria() {
  const n = randomBytes(3).readUIntBE(0, 3) % 9000 + 1000;
  return `Kiiro${n}`;
}
export function guardarProvisoria(conta, senha) {
  conta.provisoria = { ...hashSenha(senha), ate: Date.now() + 48 * 3600e3, pedida: new Date().toISOString() };
}
export function confereProvisoria(senha, conta) {
  const p = conta.provisoria;
  return !!(p && Date.now() < p.ate && confere(senha, p));
}
// mensagem pronta para mandar no WhatsApp da pessoa
export const msgProvisoria = (conta, senha, site) =>
  `Oi, ${conta.nome}! Aqui é da Kiiro 💛\n\nSua senha provisória é: *${senha}*\n\nEntre em ${site}/conta?modo=entrar com seu WhatsApp e essa senha. Logo depois você cria uma senha nova.\n\nSe não foi você que pediu, pode ignorar esta mensagem.`;

export const lerConta = async (login) => (login ? loja().get(k("u", login), { type: "json" }) : null);
export const salvarConta = (c) => loja().setJSON(k("u", c.login), c);

export async function novaSessao(login) {
  const token = randomBytes(24).toString("hex");
  await loja().setJSON(k("s", token), { login, criado: new Date().toISOString() });
  return token;
}
const DIAS_SESSAO = 180;
export async function contaDoToken(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ""))) return null;
  const s = await loja().get(k("s", token), { type: "json" });
  if (!s || Date.now() - new Date(s.criado) > DIAS_SESSAO * 864e5) return null;
  return lerConta(s.login);
}
export const fimSessao = (token) => loja().delete(k("s", token));

export const donoDoWhats = (w) => loja().get(k("w", w));
export const ligarWhats = (w, login) => loja().set(k("w", w), login);
export const soltarWhats = (w) => loja().delete(k("w", w));

// trava contra chute de senha
export async function travado(login) {
  const f = await loja().get(k("f", login), { type: "json" });
  return !!(f && f.ate && Date.now() < f.ate);
}
export async function errou(login) {
  const st = loja();
  const f = (await st.get(k("f", login), { type: "json" })) || { n: 0 };
  f.n = (f.ate && Date.now() > f.ate) ? 1 : f.n + 1;
  f.ate = f.n >= 5 ? Date.now() + 15 * 60e3 : 0;
  await st.setJSON(k("f", login), f);
}
export const acertou = (login) => loja().delete(k("f", login));

// todas as contas (para o painel)
export async function todasContas() {
  const st = loja();
  const { blobs } = await st.list({ prefix: "u:" });
  return (await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })))).filter(Boolean);
}
export async function apagarConta(login) {
  const c = await lerConta(login);
  if (!c) return;
  if (c.whats && (await donoDoWhats(c.whats)) === login) await soltarWhats(c.whats);
  if (c.tel && (await donoDoTel(c.tel)) === login) await soltarTel(c.tel);
  await loja().delete(k("u", login));
  // sessões dessa conta param de funcionar sozinhas (a conta não existe mais)
}

// o que o celular/site recebe (nunca o hash)
export const publica = (c) => ({
  trocarSenha: !!c.trocarSenha,
  id: c.id, login: c.login, tipoLogin: c.tipoLogin, nome: c.nome, sobrenome: c.sobrenome,
  tel: c.tel || "", foto: c.foto ? `/.netlify/functions/foto?id=${c.foto}` : "", whats: c.whats || "", criado: c.criado,
});
