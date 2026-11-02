// Kiiro — lista pública de profissionais.
// Lê os cadastros do Netlify Forms + as notas das avaliações.
// Endereço: /.netlify/functions/profissionais
import { getStore } from "@netlify/blobs";

// Nomes dos campos do formulário "cadastro" (cadastro.html)
const CAMPOS = { nome: "nome", categoria: "servico", cidade: "cidade", whatsapp: "whatsapp", foto: "foto", descricao: "descricao" };
const API = "https://api.netlify.com/api/v1";
const soDigitos = (s) => String(s || "").replace(/\D/g, "");

export default async (req, context) => {
  const { NETLIFY_TOKEN, APROVADOS } = process.env;
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

    // notas: soma e quantidade por profissional (só serviços feitos)
    const notas = {};
    const store = getStore("avaliacoes");
    const { blobs } = await store.list();
    const avals = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    for (const a of avals) {
      if (!a || a.feito !== "sim" || !a.nota) continue;
      const n = (notas[a.profissionalId] ||= { soma: 0, qtd: 0 });
      n.soma += a.nota; n.qtd++;
    }

    const aprovados = (APROVADOS || "").split(",").map(soDigitos).filter(Boolean);
    const vistos = new Set();
    const lista = envios
      .map((s) => {
        const d = s.data || {};
        let whats = soDigitos(d[CAMPOS.whatsapp]);
        if (whats && !whats.startsWith("55")) whats = "55" + whats;
        const foto = d[CAMPOS.foto];
        const n = notas[s.id];
        return {
          id: s.id,
          nome: String(d[CAMPOS.nome] || "").trim(),
          categoria: String(d[CAMPOS.categoria] || "").trim(),
          cidade: String(d[CAMPOS.cidade] || "").trim(),
          whatsapp: whats,
          foto: (foto && (foto.url || (typeof foto === "string" ? foto : ""))) || "",
          descricao: String(d[CAMPOS.descricao] || "").trim().slice(0, 400),
          desde: s.created_at || "",
          nota: n ? Math.round((n.soma / n.qtd) * 10) / 10 : 0,
          avaliacoes: n ? n.qtd : 0,
        };
      })
      .filter((p) => p.nome && p.categoria && p.whatsapp.length >= 12)
      .filter((p) => !aprovados.length || aprovados.some((a) => p.whatsapp.endsWith(a)))
      // se a mesma pessoa se cadastrou 2x no mesmo serviço, fica só o mais recente
      .filter((p) => { const k = p.whatsapp + "|" + p.categoria; if (vistos.has(k)) return false; vistos.add(k); return true; });

    return json(200, lista, { "Cache-Control": "public, max-age=120" });
  } catch (e) {
    return json(500, { erro: "Falha ao ler cadastros: " + String(e && e.message || e).slice(0, 120) });
  }
};

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra } });
}
