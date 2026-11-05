// Kiiro — conta do cliente e do profissional.
// POST /.netlify/functions/conta  { acao, ... }
//   criar   { login (telefone/WhatsApp), senha, nome, sobrenome, ref?, codigos? }  → { token, conta }
//   entrar  { login, senha, codigos? }                          → { token, conta }
//   dados   { token, codigos? }                                 → painel do cliente (+ do profissional, se ligado)
//   perfil  { token, nome, sobrenome, tel } · foto { token, foto } · sair { token }
//   vincular { token, whats } · desvincular { token }
//   chamado { token, ref, status, valor } · avulso { token, servico, valor, data } · avulso_apagar { token, id }
// A plataforma funciona sem conta: a conta só junta o histórico de quem quiser.
import { getStore } from "@netlify/blobs";
import { randomUUID, createHash } from "node:crypto";
import { enviarPara } from "../lib/push.mjs";
import {
  normalizarLogin, senhaBoa, hashSenha, confere, lerConta, salvarConta, novaSessao, contaDoToken, fimSessao,
  donoDoWhats, ligarWhats, soltarWhats, travado, errou, acertou, publica, comPais, telValido, donoDoTel, ligarTel, soltarTel,
} from "../lib/contas.mjs";

const limpa = (s, max = 40) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
const nomeCurto = (n) => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : (p[0] || "Cliente"); };
// o profissional vê o número escondido: (51) 9••••-4321
const mascara = (w) => { const m = String(w || "").match(/^55(\d{2})(\d)\d+(\d{4})$/); return m ? `(${m[1]}) ${m[2]}••••-${m[3]}` : ""; };
const refDe = (chave) => createHash("sha256").update(chave).digest("hex").slice(0, 16);
const CHAVE_OK = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[a-f0-9]{12}$/;
const dataDaChave = (k) => { const m = String(k).match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/); return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : ""; };
const diaSP = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export default async (req) => {
  if (req.method !== "POST") return json(405, { erro: "Método não permitido" });
  let d;
  try { d = JSON.parse(await req.text()); } catch { return json(400, { erro: "JSON inválido" }); }
  const acao = String(d.acao || "");
  const origem = new URL(req.url).origin;

  if (acao === "criar") {
    const L = normalizarLogin(d.login);
    if (!L) return json(400, { erro: "Confira seu WhatsApp com DDD." });
    const tel = L.login;
    if (!senhaBoa(d.senha)) return json(400, { erro: "A senha precisa de 8 caracteres ou mais, com letra maiúscula, minúscula e número." });
    const nome = limpa(d.nome), sobrenome = limpa(d.sobrenome);
    if (nome.length < 2 || sobrenome.length < 2) return json(400, { erro: "Informe nome e sobrenome." });
    if ((await lerConta(L.login)) || (await donoDoTel(tel))) return json(409, { erro: "Esse WhatsApp já tem conta. Toque em Entrar." });
    const conta = {
      id: randomUUID().replace(/-/g, "").slice(0, 10), login: L.login, tipoLogin: "tel", tel, nome, sobrenome,
      ...hashSenha(d.senha), criado: new Date().toISOString(), chamadas: [], convidados: 0,
    };
    // convite de um amigo: soma no contador de quem convidou
    const ref = String(d.ref || "").replace(/[^a-f0-9]/g, "").slice(0, 10);
    if (ref) {
      conta.ref = ref;
      const quem = await contaPorId(ref);
      if (quem) { quem.convidados = (quem.convidados || 0) + 1; await salvarConta(quem); }
    }
    await reivindicar(conta, d.codigos);
    // o WhatsApp é de um profissional cadastrado: já liga a área do profissional
    await tentarLigar(conta, tel, origem, false);
    await salvarConta(conta);
    await ligarTel(tel, conta.login);
    await guardarId(conta);
    return json(200, { token: await novaSessao(conta.login), conta: publica(conta) });
  }

  if (acao === "entrar") {
    const L = normalizarLogin(d.login);
    if (!L) return json(400, { erro: "Confira seu WhatsApp com DDD." });
    if (await travado(L.login)) return json(429, { erro: "Muitas tentativas. Espere 15 minutos e tente de novo." });
    const conta = await lerConta(L.login);
    if (!conta || !confere(d.senha, conta)) { if (conta) await errou(L.login); return json(401, { erro: "WhatsApp ou senha não conferem." }); }
    await acertou(L.login);
    if (await reivindicar(conta, d.codigos)) await salvarConta(conta);
    return json(200, { token: await novaSessao(conta.login), conta: publica(conta) });
  }

  // daqui para baixo, só com sessão
  const conta = await contaDoToken(d.token);
  if (!conta) return json(401, { erro: "sessao" });

  if (acao === "sair") { await fimSessao(d.token); return json(200, { ok: true }); }

  if (acao === "perfil") {
    const nome = limpa(d.nome), sobrenome = limpa(d.sobrenome);
    if (nome.length < 2 || sobrenome.length < 2) return json(400, { erro: "Informe nome e sobrenome." });
    Object.assign(conta, { nome, sobrenome });
    await salvarConta(conta);
    return json(200, { conta: publica(conta) });
  }

  if (acao === "foto") {
    const m = typeof d.foto === "string" ? d.foto.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/) : null;
    if (!m) return json(400, { erro: "Foto inválida" });
    const bytes = Buffer.from(m[1], "base64");
    if (!bytes.length || bytes.length > 600 * 1024) return json(400, { erro: "Foto muito grande" });
    const fotos = getStore("fotos");
    if (conta.foto) await fotos.delete(conta.foto).catch(() => {});
    conta.foto = randomUUID();
    await fotos.set(conta.foto, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    await salvarConta(conta);
    return json(200, { conta: publica(conta) });
  }

  if (acao === "vincular") {
    const w = comPais(d.whats);
    const r = await tentarLigar(conta, w, origem, true);
    if (r) return json(400, { erro: r });
    await salvarConta(conta);
    return json(200, { conta: publica(conta) });
  }
  if (acao === "desvincular") {
    if (conta.whats && (await donoDoWhats(conta.whats)) === conta.login) await soltarWhats(conta.whats);
    delete conta.whats;
    await salvarConta(conta);
    return json(200, { conta: publica(conta) });
  }

  // cliente: "não foi feito" tira o chamado da lista (dá para mostrar de novo)
  if (acao === "ocultar") {
    const c = String(d.c || "");
    if (!CHAVE_OK.test(c)) return json(400, { erro: "Dados inválidos" });
    const o = new Set(conta.ocultos || []);
    if (d.ocultar === false) o.delete(c); else o.add(c);
    conta.ocultos = [...o].slice(-500);
    await salvarConta(conta);
    return json(200, { ok: true });
  }

  if (acao === "chamado" || acao === "avulso" || acao === "avulso_apagar") {
    if (!conta.whats || (await donoDoWhats(conta.whats)) !== conta.login) return json(403, { erro: "Conta sem profissional ligado." });
    const st = getStore({ name: "ganhos", consistency: "strong" });
    const g = (await st.get(conta.whats, { type: "json" })) || { chamados: {}, avulsos: [] };
    const valor = Math.max(0, Math.min(1e6, Math.round(Number(String(d.valor || "0").replace(/\./g, "").replace(",", ".")) * 100) / 100)) || 0;
    if (acao === "chamado") {
      const ref = String(d.ref || "");
      const status = ["fechou", "nao", "aberto"].includes(d.status) ? d.status : "";
      if (!/^[a-f0-9]{16}$/.test(ref) || !status) return json(400, { erro: "Dados inválidos" });
      if (status === "aberto") delete g.chamados[ref];
      else g.chamados[ref] = { status, valor: status === "fechou" ? valor : 0, em: new Date().toISOString() };
    }
    if (acao === "avulso") {
      const data = /^\d{4}-\d{2}-\d{2}$/.test(d.data) ? d.data : diaSP(Date.now());
      if (!valor) return json(400, { erro: "Informe o valor." });
      g.avulsos.push({ id: randomUUID().slice(0, 8), servico: limpa(d.servico, 50) || "Serviço", valor, data });
      g.avulsos = g.avulsos.slice(-500);
    }
    if (acao === "avulso_apagar") g.avulsos = g.avulsos.filter((a) => a.id !== d.id);
    await st.setJSON(conta.whats, g);
    return json(200, { ok: true });
  }

  if (acao === "dados") {
    if (await reivindicar(conta, d.codigos)) await salvarConta(conta);
    return json(200, await montarDados(conta, origem));
  }

  return json(400, { erro: "Ação desconhecida" });
};

/* ---------- ajudantes ---------- */

// liga as chamadas feitas neste celular (antes de entrar) à conta. O código só existe no aparelho de quem chamou.
async function reivindicar(conta, codigos) {
  if (!Array.isArray(codigos) || !codigos.length) return false;
  const st = getStore("chamadas");
  const ja = new Set(conta.chamadas || []);
  let mudou = false;
  for (const c of codigos.slice(-20)) {
    if (!CHAVE_OK.test(c) || ja.has(c)) continue;
    if (await st.get(c)) { ja.add(c); mudou = true; }
  }
  conta.chamadas = [...ja].slice(-300);
  return mudou;
}

// índice id → login (para os convites)
const guardarId = (c) => getStore({ name: "contas", consistency: "strong" }).set(`id:${c.id}`, c.login);
async function contaPorId(id) {
  const login = await getStore({ name: "contas", consistency: "strong" }).get(`id:${id}`);
  return login ? lerConta(login) : null;
}

async function listaPros(origem) {
  try { const r = await fetch(`${origem}/.netlify/functions/profissionais`); const l = await r.json(); return Array.isArray(l) ? l : []; } catch { return []; }
}

// devolve texto de erro, ou "" quando ligou
async function tentarLigar(conta, w, origem, avisarErro) {
  if (!(w.length >= 12 && w.length <= 13)) return "Confira o WhatsApp com DDD.";
  const pro = (await listaPros(origem)).find((p) => p.whatsapp === w);
  if (!pro) return avisarErro ? "Não achamos um cadastro de profissional com esse WhatsApp. Use o mesmo número do cadastro." : "";
  const dono = await donoDoWhats(w);
  if (dono && dono !== conta.login) return avisarErro ? "Esse WhatsApp já está ligado a outra conta. Fale com a Kiiro para liberar." : "";
  if (conta.whats && conta.whats !== w && (await donoDoWhats(conta.whats)) === conta.login) await soltarWhats(conta.whats);
  conta.whats = w;
  await ligarWhats(w, conta.login);
  // segurança sem confirmação por código: avisa o dono do painel e o próprio profissional
  if (process.env.NTFY_TOPIC) {
    try {
      await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        topic: process.env.NTFY_TOPIC, tags: ["key"],
        title: `🔑 Conta ligada ao profissional ${pro.nome}`,
        message: `Entrou como ${conta.nome} ${conta.sobrenome} (${conta.tipoLogin === "email" ? conta.login : "telefone"}). Se não for ele, desligue no painel, aba Contas.`,
        click: `https://wa.me/${w}`,
      }) });
    } catch {}
  }
  try {
    await enviarPara({ tipo: "pro", whats: w }, {
      title: "🔑 Sua conta na Kiiro foi ligada ao seu perfil",
      body: "Agora você vê visitas, chamados e ganhos no menu ☰ › Minha conta. Não foi você? Fale com a Kiiro.",
      url: "/conta", tag: "kiiro-conta",
    });
  } catch {}
  return "";
}

async function montarDados(conta, origem) {
  const chamadas = getStore("chamadas");
  const avaliacoes = getStore("avaliacoes");

  // todas as chamadas (as chaves começam pela data: das mais novas para as mais antigas, no máximo 1500)
  const chaves = (await chamadas.list()).blobs.map((b) => b.key).sort().reverse().slice(0, 1500);
  const lidos = await Promise.all(chaves.map(async (k) => ({ k, ch: await chamadas.get(k, { type: "json" }) })));

  // ----- como cliente: as feitas com o WhatsApp da conta (mesmo sem estar logado) + as deste celular
  const daConta = new Set(conta.chamadas || []);
  const minhas = (await Promise.all(lidos.filter(({ k, ch }) => ch && (daConta.has(k) || (conta.tel && ch.clienteWhatsapp === conta.tel))).map(async ({ k, ch }) => {
    const av = await avaliacoes.get(k, { type: "json" });
    return {
      c: k, oculto: (conta.ocultos || []).includes(k), data: ch.data, pro: ch.profissionalNome, proId: ch.profissionalId, categoria: ch.categoria, cidade: ch.cidade,
      avaliacao: av ? { feito: av.feito, nota: av.nota || 0 } : null,
    };
  }))).sort((a, b) => (a.data < b.data ? 1 : -1));
  const cliente = {
    chamados: minhas.filter((m) => !m.oculto).length,
    avaliados: minhas.filter((m) => m.avaliacao).length,
    convidados: conta.convidados || 0,
    lista: minhas.slice(0, 60),
  };

  // ----- como profissional (só se o WhatsApp está ligado a esta conta)
  let pro = null;
  if (conta.whats && (await donoDoWhats(conta.whats)) === conta.login) {
    const w = conta.whats;
    const p = (await listaPros(origem)).find((x) => x.whatsapp === w);
    // visitas e cliques por dia
    const mt = getStore({ name: "pros", consistency: "strong" });
    const { blobs } = await mt.list({ prefix: `${w}#` });
    const dias = {};
    for (const b of blobs) {
      const m = await mt.get(b.key, { type: "json" });
      if (!m) continue;
      for (const [t, porDia] of Object.entries(m)) for (const [dia, n] of Object.entries(porDia)) { const o = (dias[dia] ||= { v: 0, c: 0 }); o[t] = (o[t] || 0) + n; }
    }
    // chamados recebidos
    const ids = new Set([p && String(p.id)].filter(Boolean));
    const g = (await getStore({ name: "ganhos", consistency: "strong" }).get(w, { type: "json" })) || { chamados: {}, avulsos: [] };
    const recebidos = [];
    const notas = [];
    for (const { k, ch } of lidos) {
      if (!ch || !(ch.profissionalWhatsapp === w || ids.has(String(ch.profissionalId)))) continue;
      const av = await avaliacoes.get(k, { type: "json" });
      if (av && av.feito === "sim" && av.nota) notas.push(av.nota);
      const ref = refDe(k);
      const gg = g.chamados[ref] || null;
      recebidos.push({
        ref, data: ch.data || dataDaChave(k), cliente: nomeCurto(ch.clienteNome), tel: mascara(ch.clienteWhatsapp),
        categoria: ch.categoria, cidade: ch.cidade, nota: av && av.feito === "sim" ? av.nota : 0,
        status: gg ? gg.status : "aberto", valor: gg ? gg.valor : 0,
      });
    }
    pro = {
      nome: p ? p.nome : conta.nome, id: p ? p.id : "", categoria: p ? (p.categorias || [p.categoria])[0] : "", foto: p ? p.foto : "",
      dias, chamados: recebidos.slice(0, 200), avulsos: g.avulsos || [],
      nota: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : 0, avaliacoes: notas.length,
    };
  }
  return { conta: publica(conta), cliente, pro };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
