// Kiiro — lista pública de profissionais.
// Lê os cadastros do Netlify Forms + as notas das avaliações.
// Endereço: /.netlify/functions/profissionais
import { getStore } from "@netlify/blobs";

// Nomes dos campos do formulário "cadastro" (cadastro.html)
const urlDe = (f) => (f && (f.url || (typeof f === "string" && /^https?:/.test(f) ? f : ""))) || "";
const CAMPOS = { nome: "nome", categoria: "servico", cidade: "cidade", whatsapp: "whatsapp", foto: "foto", descricao: "descricao" };
const API = "https://api.netlify.com/api/v1";
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
// número com DDD (10 ou 11 dígitos) ganha o 55 do Brasil. Não dá para olhar só se começa com 55: o DDD 55 existe (Santa Maria e região)
const comPais = (d) => { d = String(d || "").replace(/\D/g, ""); return d.length === 10 || d.length === 11 ? "55" + d : d; };
const curto = (s, max = 40) => String(s || "").trim().slice(0, max);

export default async (req, context) => {
  const { NETLIFY_TOKEN, APROVADOS, ADMIN_KEY } = process.env;
  // modo do painel: /.netlify/functions/profissionais?admin=CHAVE → inclui ocultos, ids dos cadastros e sem cache
  const admin = !!ADMIN_KEY && new URL(req.url).searchParams.get("admin") === ADMIN_KEY;
  // o Netlify já informa o ID do site sozinho
  const SITE_ID = process.env.KIIRO_SITE_ID || context?.site?.id || process.env.SITE_ID;
  const FORM_NAME = process.env.FORM_NAME || "cadastro";
  if (!NETLIFY_TOKEN || !SITE_ID) return json(500, { erro: !NETLIFY_TOKEN ? "Falta a variável NETLIFY_TOKEN" : "Não encontrei o ID do site" });
  const headers = { Authorization: `Bearer ${NETLIFY_TOKEN}` };

  try {
    const rf = await fetch(`${API}/sites/${SITE_ID}/forms`, { headers });
    if (rf.status === 401) return json(500, { erro: "Token do Netlify inválido (NETLIFY_TOKEN)" });
    if (!rf.ok) return json(500, { erro: `API do Netlify respondeu ${rf.status} ao buscar formulários` });
    const forms = await rf.json();
    const form = Array.isArray(forms) && forms.find((f) => f.name === FORM_NAME);
    if (!form) return json(200, []); // ainda não chegou nenhum cadastro

    let envios = [];
    for (let page = 1; page <= 20; page++) {
      const lote = await (await fetch(`${API}/forms/${form.id}/submissions?per_page=100&page=${page}`, { headers })).json();
      if (!Array.isArray(lote) || !lote.length) break;
      envios = envios.concat(lote);
      if (lote.length < 100) break;
    }

    // WhatsApp de cada cadastro (inclusive os antigos), para ligar avaliações à pessoa e não ao cadastro
    const whatsDoId = {};
    const idsDoWhats = {};
    for (const e of envios) {
      let w = soDigitos((e.data || {})[CAMPOS.whatsapp]);
      w = comPais(w);
      whatsDoId[e.id] = w;
      (idsDoWhats[w] ||= []).push(e.id);
    }

    // notas: soma e quantidade por WhatsApp do profissional (só serviços feitos)
    const notas = {};
    const store = getStore("avaliacoes");
    const { blobs } = await store.list();
    const avals = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    for (const a of avals) {
      if (!a || a.feito !== "sim" || !a.nota) continue;
      const w = a.profissionalWhatsapp || whatsDoId[a.profissionalId];
      if (!w) continue;
      const n = (notas[w] ||= { soma: 0, qtd: 0 });
      n.soma += a.nota; n.qtd++;
    }

    // avaliações pelo link do profissional, aprovadas no painel, também contam na nota
    try {
      const sti = getStore("indicacoes");
      const { blobs: bi } = await sti.list();
      for (const x of await Promise.all(bi.map((b) => sti.get(b.key, { type: "json" })))) {
        if (!x || x.status !== "aprovada" || !(x.nota >= 1 && x.nota <= 5)) continue;
        const w = x.profissionalWhatsapp || whatsDoId[x.profissionalId];
        if (!w) continue;
        const n = (notas[w] ||= { soma: 0, qtd: 0 });
        n.soma += x.nota; n.qtd++;
      }
    } catch {}

    const aprovados = (APROVADOS || "").split(",").map(soDigitos).filter(Boolean);
    let ocultos = [];
    try { ocultos = (await getStore("admin").get("ocultos", { type: "json" })) || []; } catch {}
    const ocultosSet = new Set(ocultos);
    // fotos trocadas pelo painel: { whatsapp: { foto: id, trabalhos: [id] } }
    let trocas = {};
    try { trocas = (await getStore("admin").get("fotosPro", { type: "json" })) || {}; } catch {}
    const urlFoto = (id) => `/.netlify/functions/foto?id=${id}`;
    // dados editados pelo painel: { whatsapp: { nome, categorias, cidade, descricao, ... } }
    let edicoes = {};
    try { edicoes = (await getStore("admin").get("editsPro", { type: "json" })) || {}; } catch {}
    const vistos = new Set();
    const lista = envios
      .map((s) => {
        const d = s.data || {};
        let whats = soDigitos(d[CAMPOS.whatsapp]);
        whats = comPais(whats);
        const foto = d[CAMPOS.foto];
        const n = notas[whats];
        return {
          id: s.id,
          nome: String(d[CAMPOS.nome] || "").trim(),
          categorias: String(d[CAMPOS.categoria] || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3),
          cidade: String(d[CAMPOS.cidade] || "").trim(),
          cidadeBase: curto(d.cidade_base),
          raio: curto(d.raio, 4),
          whatsapp: whats,
          ids: (idsDoWhats[whats] || [s.id]).slice(0, 10),
          foto: urlDe(foto),
          trabalhos: ["trabalho1", "trabalho2", "trabalho3"].map((k) => urlDe(d[k])).filter(Boolean),
          descricao: String(d[CAMPOS.descricao] || "").trim().slice(0, 400),
          experiencia: curto(d.experiencia),
          dedicacao: curto(d.dedicacao),
          urgencia: curto(d.urgencia),
          dias: curto(d.dias, 80),
          orcamento: curto(d.orcamento),
          mei: curto(d.mei),
          desde: s.created_at || "",
          nota: n ? Math.round((n.soma / n.qtd) * 10) / 10 : 0,
          avaliacoes: n ? n.qtd : 0,
        };
      })
      .map((p) => ({ ...p, categoria: p.categorias[0] || "" }))
      .filter((p) => p.nome && p.categoria && p.whatsapp.length >= 12)
      .filter((p) => !aprovados.length || aprovados.some((a) => p.whatsapp.endsWith(a)))
      // se a mesma pessoa (mesmo WhatsApp) se cadastrou mais de uma vez, fica só o cadastro mais recente
      .filter((p) => { if (vistos.has(p.whatsapp)) return false; vistos.add(p.whatsapp); return true; });

    for (const p of lista) {
      const ed = edicoes[p.whatsapp];
      if (ed) {
        for (const k of ["nome", "cidade", "cidadeBase", "raio", "descricao", "experiencia", "dedicacao", "urgencia", "dias", "orcamento", "mei"]) if (typeof ed[k] === "string" && ed[k]) p[k] = ed[k];
        if (Array.isArray(ed.categorias) && ed.categorias.length) { p.categorias = ed.categorias.slice(0, 3); p.categoria = p.categorias[0]; }
        p.editado = true;
      }
      const t = trocas[p.whatsapp];
      if (!t) continue;
      if (t.foto) p.foto = urlFoto(t.foto);
      if (t.trabalhos && t.trabalhos.length) p.trabalhos = t.trabalhos.map(urlFoto);
      p.fotoTrocada = !!t.foto; p.trabalhosTrocados = !!(t.trabalhos && t.trabalhos.length);
    }

    if (admin) return json(200, lista.map((p) => ({ ...p, oculto: ocultosSet.has(p.whatsapp) })), { "Cache-Control": "no-store" });
    return json(200, lista.filter((p) => !ocultosSet.has(p.whatsapp)), { "Cache-Control": "public, max-age=60" });
  } catch (e) {
    return json(500, { erro: "Falha ao ler cadastros: " + String(e && e.message || e).slice(0, 120) });
  }
};

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
}
