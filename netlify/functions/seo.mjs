// Kiiro — páginas para o Google: um endereço por serviço e cidade.
//   /servicos                              -> lista de cidades e serviços
//   /servicos/eletricista-em-osorio        -> profissionais daquele serviço na cidade
//   /servicos/profissionais-em-osorio      -> todos os profissionais da cidade
//   /sitemap.xml                           -> mapa do site para o Google (só páginas com profissionais)
// Os dados vêm dos mesmos arquivos do site (servicos.js, cidades.js) e da lista de profissionais.

export const config = { path: ["/servicos", "/servicos/:slug", "/sitemap.xml"] };

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const slugDe = (s) => semAcento(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TODAS = "Todo o Litoral Norte";

// lê um arquivo .js do site que preenche window.X
async function lerJanela(base, arq) {
  const win = {};
  try { new Function("window", await (await fetch(`${base}/${arq}`)).text())(win); } catch {}
  return win;
}

async function dados(base) {
  const [s, c] = await Promise.all([lerJanela(base, "servicos.js"), lerJanela(base, "cidades.js")]);
  const grupos = s.KIIRO_SERVICOS || [];
  const antigos = s.KIIRO_SERVICOS_ANTIGOS || {};
  const servicos = grupos.flatMap((g) => g.itens);
  const cidades = c.KIIRO_CIDADES || [];
  let pros = [];
  try { pros = await (await fetch(`${base}/.netlify/functions/profissionais`)).json(); } catch {}
  if (!Array.isArray(pros)) pros = [];
  pros = pros.map((p) => ({
    ...p,
    categorias: (p.categorias || [p.categoria]).filter(Boolean).map((x) => antigos[x] || x),
    cids: String(p.cidade || "").split(/\s*,\s*/).filter(Boolean),
  }));
  return { servicos, cidades, pros };
}

const atende = (p, cidade) => p.cids.some((x) => semAcento(x) === semAcento(TODAS) || semAcento(x) === semAcento(cidade));
const faz = (p, serv) => p.categorias.includes(serv);
const ordenar = (l) => [...l].sort((a, b) => (b.avaliacoes > 0) - (a.avaliacoes > 0) || (b.nota || 0) - (a.nota || 0) || (b.avaliacoes || 0) - (a.avaliacoes || 0));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function paginas({ servicos, cidades }) {
  const m = new Map();
  for (const c of cidades) {
    m.set(`profissionais-em-${slugDe(c)}`, { cidade: c });
    for (const s of servicos) m.set(`${slugDe(s)}-em-${slugDe(c)}`, { servico: s, cidade: c });
  }
  return m;
}

const LOGO = `<svg viewBox="0 0 340 150" role="img" aria-label="Kiiro"><g fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M30 22V118M80 62L30 94M48 84L84 118M118 62V118M166 62V118M206 62V118M206 88C206 70 220 62 238 64"/><circle cx="282" cy="90" r="28"/><path d="M137 24H147" stroke-width="6"/></g><path d="M118 46C118 46 104 34 104 24A14 14 0 0 1 132 24C132 34 118 46 118 46ZM166 46C166 46 152 34 152 24A14 14 0 0 1 180 24C180 34 166 46 166 46Z" fill="currentColor"/><circle cx="118" cy="24" r="5" fill="#FFC800"/><circle cx="166" cy="24" r="5" fill="#FFC800"/></svg>`;

function pagina({ base, caminho, titulo, desc, h1, corpo, indexar, ld, trilha = "" }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(desc)}">
${indexar ? "" : '<meta name="robots" content="noindex, follow">\n'}<link rel="canonical" href="${base}${caminho}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Kiiro">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${base}${caminho}">
<meta property="og:image" content="${base}/img/og-kiiro.jpg">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FFC800">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/estilo.css">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}
<style>
  body{background:var(--paper)}
  .s-topo{background:var(--paper);border-bottom:1px solid var(--line);padding:.8rem 1.25rem}
  .s-in{max-width:880px;margin:0 auto}
  .s-topo .s-in{display:flex;align-items:center;justify-content:space-between;gap:1rem}
  .s-logo{color:var(--ink);width:96px;display:block}
  .s-logo svg{width:100%;height:auto;display:block}
  .s-pro{background:var(--sun);color:var(--ink);border-radius:999px;padding:.5rem 1rem;font-weight:600;font-size:.85rem;text-decoration:none}
  .s-main{max-width:880px;margin:0 auto;padding:1.2rem 1.25rem 2.5rem}
  .s-trilha{font-size:.8rem;color:var(--muted);margin-bottom:.8rem}
  .s-trilha a{color:var(--muted)}
  .s-main h1{font-size:clamp(1.8rem,6vw,2.6rem);font-weight:800;letter-spacing:-.03em;line-height:1.08}
  .s-main h1 em{font-style:normal;background:linear-gradient(transparent 60%,var(--sun) 60%)}
  .s-intro{margin:.7rem 0 1.4rem;color:var(--muted);line-height:1.55;max-width:40rem}
  .s-lista{display:grid;gap:.8rem}
  @media(min-width:700px){.s-lista{grid-template-columns:1fr 1fr}}
  .s-card{display:flex;gap:.9rem;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:.9rem;text-decoration:none;color:var(--text)}
  .s-foto{flex:none;width:76px;height:76px;border-radius:14px;background:var(--ink) center/cover;color:var(--sun);display:grid;place-items:center;font-weight:800;font-size:1.5rem}
  .s-card h2{font-size:1.02rem;font-weight:700;color:var(--ink);line-height:1.2}
  .s-meta{font-size:.8rem;color:var(--muted);margin:.15rem 0 .35rem}
  .s-meta b{color:var(--ink)}
  .s-desc{font-size:.85rem;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .s-bt{display:inline-block;margin-top:.5rem;font-size:.82rem;font-weight:700;color:var(--ink);border-bottom:2px solid var(--sun)}
  .s-vazio{background:var(--card);border:1px dashed #D9C88E;border-radius:18px;padding:1.2rem;line-height:1.55}
  .s-cta{display:flex;flex-wrap:wrap;gap:.6rem;margin:1.4rem 0}
  .s-sec{margin-top:2rem}
  .s-sec h3{font-size:1.05rem;font-weight:700;margin-bottom:.6rem}
  .s-tags{display:flex;flex-wrap:wrap;gap:.45rem}
  .s-tags a{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.45rem .85rem;font-size:.85rem;color:var(--ink);text-decoration:none}
  .s-tags a small{color:var(--muted)}
  .s-faq p{margin:.2rem 0 .9rem;line-height:1.55;font-size:.92rem}
  .s-faq b{display:block;color:var(--ink)}
  .s-rod{background:var(--ink);color:#BDB59C;padding:1.6rem 1.25rem 2rem;font-size:.85rem;line-height:1.6}
  .s-rod a{color:#fff;margin-right:1rem;text-decoration:none}
</style>
</head>
<body>
<header class="s-topo"><div class="s-in"><a class="s-logo" href="/" aria-label="Kiiro, início">${LOGO}</a><a class="s-pro" href="/cadastro">Sou profissional</a></div></header>
<main class="s-main">
${trilha}
  <h1>${h1}</h1>
${corpo}
</main>
<footer class="s-rod"><div class="s-in">
  <p>A Kiiro conecta você ao profissional. Valor, prazo e execução do serviço são combinados diretamente entre cliente e profissional.</p>
  <p style="margin-top:.8rem"><a href="/">Início</a><a href="/servicos">Serviços por cidade</a><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a><a href="/anunciar">Anuncie</a></p>
  <p style="margin-top:.6rem;opacity:.8">© ${new Date().getFullYear()} Kiiro · Litoral Norte do RS</p>
</div></footer>
</body>
</html>`;
}

function card(p) {
  const iniciais = String(p.nome).split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  const nota = p.avaliacoes > 0 && p.nota > 0 ? `★ <b>${Number(p.nota || 0).toFixed(1).replace(".", ",")}</b> (${plural(p.avaliacoes, "avaliação", "avaliações")})` : "Novo na Kiiro";
  const cids = p.cids.length > 3 ? p.cids.slice(0, 3).join(", ") + "…" : p.cids.join(", ");
  return `<a class="s-card" href="/#p-${encodeURIComponent(p.id)}">
    <span class="s-foto"${p.foto ? ` style="background-image:url('${esc(p.foto)}')"` : ""}>${p.foto ? "" : esc(iniciais)}</span>
    <span style="min-width:0"><h2>${esc(p.nome)}</h2>
      <span class="s-meta" style="display:block">${esc(p.categorias.join(" · "))} · ${nota}</span>
      <span class="s-meta" style="display:block">📍 ${esc(cids)}${p.urgencia === "Sim" ? " · ⚡ Atende urgência" : ""}</span>
      ${p.descricao ? `<span class="s-desc">${esc(p.descricao)}</span>` : ""}
      <span class="s-bt">Ver perfil e chamar no WhatsApp</span></span>
  </a>`;
}

const xml = (s) => new Response(s, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
const html = (s, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });

export default async (req) => {
  const u = new URL(req.url);
  const base = u.origin;
  const d = await dados(base);
  const mapa = paginas(d);
  const temPro = (k) => {
    const pg = mapa.get(k);
    return d.pros.some((p) => atende(p, pg.cidade) && (!pg.servico || faz(p, pg.servico)));
  };

  // ---- mapa do site
  if (u.pathname === "/sitemap.xml") {
    const hoje = new Date().toISOString().slice(0, 10);
    const urls = ["/", "/servicos", "/cadastro", "/anunciar", "/termos", "/privacidade", ...[...mapa.keys()].filter(temPro).map((k) => `/servicos/${k}`)];
    return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${hoje}</lastmod></url>`).join("\n")}\n</urlset>`);
  }

  // ---- índice /servicos
  const slug = (u.pathname.match(/^\/servicos\/([^/]+)\/?$/) || [])[1];
  if (!slug) {
    const porCidade = d.cidades.map((c) => {
      const servs = d.servicos.filter((s) => d.pros.some((p) => atende(p, c) && faz(p, s)));
      return { c, servs };
    }).filter((x) => x.servs.length);
    const corpo = `
  <p class="s-intro">Escolha a cidade e o serviço. Todos os profissionais atendem no Litoral Norte do RS e você chama direto no WhatsApp.</p>
  ${porCidade.map(({ c, servs }) => `<section class="s-sec"><h3><a href="/servicos/profissionais-em-${slugDe(c)}" style="color:inherit">Profissionais em ${esc(c)}</a></h3>
    <div class="s-tags">${servs.map((s) => `<a href="/servicos/${slugDe(s)}-em-${slugDe(c)}">${esc(s)}</a>`).join("")}</div></section>`).join("") || `<p class="s-vazio">Em breve.</p>`}`;
    return html(pagina({ base, caminho: "/servicos", titulo: "Serviços por cidade no Litoral Norte do RS | Kiiro", desc: "Encontre eletricista, diarista, pintor, jardineiro e outros profissionais em cada cidade do Litoral Norte do RS e chame no WhatsApp.", h1: "Serviços por cidade no <em>Litoral Norte</em>", corpo, indexar: true }));
  }

  const pg = mapa.get(slug);
  if (!pg) {
    return html(pagina({ base, caminho: u.pathname, titulo: "Página não encontrada | Kiiro", desc: "", h1: "Página não encontrada", corpo: `<p class="s-intro">Essa página não existe. <a href="/servicos">Ver serviços por cidade</a> ou <a href="/">buscar na Kiiro</a>.</p>`, indexar: false }), 404);
  }

  const { servico, cidade } = pg;
  const nome = servico || "Profissionais";
  const lista = ordenar(d.pros.filter((p) => atende(p, cidade) && (!servico || faz(p, servico))));
  const n = lista.length;
  const caminho = `/servicos/${slug}`;
  const linkApp = `/?cidade=${encodeURIComponent(cidade)}${servico ? `&servico=${encodeURIComponent(servico)}` : ""}`;

  // links relacionados (só para páginas com gente)
  const outrosServ = servico
    ? d.servicos.filter((s) => s !== servico && d.pros.some((p) => atende(p, cidade) && faz(p, s)))
    : d.servicos.filter((s) => d.pros.some((p) => atende(p, cidade) && faz(p, s)));
  const outrasCid = d.cidades.filter((c) => c !== cidade && d.pros.some((p) => atende(p, c) && (!servico || faz(p, servico))));
  const contar = (s, c) => d.pros.filter((p) => atende(p, c) && (!s || faz(p, s))).length;

  const termo = servico ? servico.toLowerCase() : "profissionais";
  const titulo = servico ? `${servico} em ${cidade}, RS · Chame no WhatsApp | Kiiro` : `Profissionais em ${cidade}, RS · Chame no WhatsApp | Kiiro`;
  const desc = n
    ? `${servico || "Profissionais"} em ${cidade}, RS: ${plural(n, "profissional", "profissionais")} com avaliações. Chame direto no WhatsApp, sem taxa.`
    : `Procurando ${termo} em ${cidade}, RS? Veja profissionais do Litoral Norte na Kiiro e chame direto no WhatsApp.`;

  const lista_html = n
    ? `<div class="s-lista">${lista.map(card).join("")}</div>
  <div class="s-cta"><a class="btn btn-ink" href="${esc(linkApp)}">Ver na Kiiro com filtros</a></div>`
    : `<div class="s-vazio"><b>Ainda não temos ${esc(termo)} cadastrado em ${esc(cidade)}.</b><br>${outrasCid.length ? `Veja quem atende em cidades próximas logo abaixo, ou ` : ""}<a href="/">procure outro serviço na Kiiro</a>.</div>`;

  const corpo = `
  <p class="s-intro">${n ? `${plural(n, "profissional", "profissionais")} que ${n === 1 ? "atende" : "atendem"} em ${esc(cidade)}, no Litoral Norte do RS. ` : ""}Veja a nota de quem já contratou e chame direto no WhatsApp. Valor, visita e prazo você combina com o profissional, sem taxa da Kiiro.</p>
  ${lista_html}
  ${servico && outrasCid.length ? `<section class="s-sec"><h3>${esc(servico)} em outras cidades</h3><div class="s-tags">${outrasCid.map((c) => `<a href="/servicos/${slugDe(servico)}-em-${slugDe(c)}">${esc(c)} <small>(${contar(servico, c)})</small></a>`).join("")}</div></section>` : ""}
  ${outrosServ.length ? `<section class="s-sec"><h3>${servico ? "Outros serviços" : "Serviços"} em ${esc(cidade)}</h3><div class="s-tags">${outrosServ.map((s) => `<a href="/servicos/${slugDe(s)}-em-${slugDe(cidade)}">${esc(s)} <small>(${contar(s, cidade)})</small></a>`).join("")}</div></section>` : ""}
  ${!servico && outrasCid.length ? `<section class="s-sec"><h3>Outras cidades</h3><div class="s-tags">${outrasCid.map((c) => `<a href="/servicos/profissionais-em-${slugDe(c)}">${esc(c)}</a>`).join("")}</div></section>` : ""}
  <section class="s-sec s-faq"><h3>Perguntas frequentes</h3>
    <p><b>Como chamo ${servico ? "um " + esc(servico.toLowerCase()) : "um profissional"} em ${esc(cidade)}?</b>Toque no perfil, veja as avaliações e toque em chamar. A conversa abre direto no WhatsApp do profissional.</p>
    <p><b>A Kiiro cobra alguma taxa?</b>Não. O valor do serviço é combinado direto com o profissional.</p>
    <p><b>Sou ${servico ? esc(servico.toLowerCase()) : "profissional"} em ${esc(cidade)}. Como apareço aqui?</b><a href="/cadastro">Faça o cadastro grátis</a> em 2 minutos.</p>
  </section>`;

  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Kiiro", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: "Serviços por cidade", item: `${base}/servicos` },
      { "@type": "ListItem", position: 3, name: servico ? `${servico} em ${cidade}` : `Profissionais em ${cidade}`, item: `${base}${caminho}` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "A Kiiro cobra alguma taxa?", acceptedAnswer: { "@type": "Answer", text: "Não. O valor do serviço é combinado direto com o profissional." } },
    ] },
  ];

  const h1 = `${esc(nome)} em <em>${esc(cidade)}</em>`;
  const trilha = `  <nav class="s-trilha"><a href="/">Kiiro</a> › <a href="/servicos">Serviços por cidade</a> › ${servico ? `<a href="/servicos/profissionais-em-${slugDe(cidade)}">${esc(cidade)}</a> › ${esc(servico)}` : esc(cidade)}</nav>`;
  return html(pagina({ base, caminho, titulo, desc, h1, corpo, indexar: n > 0, ld, trilha }));
};
