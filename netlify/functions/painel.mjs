// Kiiro — seu painel.
// Endereço: /painel?chave=SUA_ADMIN_KEY
// Abas: Resumo (acessos e funil) · Profissionais (ocultar, mostrar, excluir) · Chamadas (quem chamou quem, e como foi)
import { getStore } from "@netlify/blobs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TZ = "America/Sao_Paulo";
const API = "https://api.netlify.com/api/v1";
const fmt = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const diaSP = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ }); // AAAA-MM-DD
const tel = (n) => String(n).replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
const num = (n) => Number(n || 0).toLocaleString("pt-BR");
// chave de chamada = "2026-11-02T05-10-00-000Z_abc123" → data
const dataDaChave = (k) => { const m = String(k).match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/); return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null; };

export default async (req) => {
  const url = new URL(req.url);
  const KEY = process.env.ADMIN_KEY;
  const chave = url.searchParams.get("chave") || (req.method === "POST" ? (await req.clone().formData().catch(() => null))?.get("chave") : null);
  if (!KEY || chave !== KEY) return new Response("Acesso negado", { status: 401 });
  const q = (extra = {}) => "?" + new URLSearchParams({ chave: KEY, ...extra }).toString();
  const aba = url.searchParams.get("aba") || "resumo";
  const filtro = url.searchParams.get("ver") || "todas";
  const base = url.origin;

  /* ---------- ações ---------- */
  if (req.method === "POST") {
    const f = await req.formData();
    const acao = f.get("acao");
    const w = String(f.get("w") || "").replace(/\D/g, "");
    const admin = getStore("admin");
    const ocultos = new Set((await admin.get("ocultos", { type: "json" })) || []);
    let aviso = "";
    if (acao === "ocultar" && w) { ocultos.add(w); aviso = "Profissional ocultado do site."; }
    if (acao === "mostrar" && w) { ocultos.delete(w); aviso = "Profissional aparece no site de novo."; }
    if (acao === "excluir" && w) {
      const ids = String(f.get("ids") || "").split(",").filter((x) => /^[\w-]+$/.test(x));
      let ok = 0;
      for (const id of ids) {
        const r = await fetch(`${API}/submissions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${process.env.NETLIFY_TOKEN}` } });
        if (r.ok || r.status === 404) ok++;
      }
      ocultos.delete(w);
      aviso = ok === ids.length ? "Cadastro excluído." : `Excluí ${ok} de ${ids.length} cadastros. Tente de novo ou apague em Forms no Netlify.`;
    }
    await admin.setJSON("ocultos", [...ocultos]);
    return Response.redirect(`${base}/painel${q({ aba: "profissionais", aviso })}`, 303);
  }

  // ocultar foto de uma avaliação
  const ocultarFoto = url.searchParams.get("ocultar");
  if (ocultarFoto) {
    const avs = getStore("avaliacoes");
    const av = await avs.get(ocultarFoto, { type: "json" });
    if (av && av.fotoId) { await getStore("fotos").delete(av.fotoId); delete av.fotoId; await avs.setJSON(ocultarFoto, av); }
    return Response.redirect(`${base}/painel${q({ aba: "chamadas", ver: filtro })}`, 303);
  }

  /* ---------- dados ---------- */
  const chamadas = getStore("chamadas");
  const avaliacoes = getStore("avaliacoes");
  const todasChaves = (await chamadas.list()).blobs.map((b) => b.key).sort().reverse();
  const avKeys = new Set((await avaliacoes.list()).blobs.map((b) => b.key));

  const hoje = diaSP(Date.now());
  const diasAtras = (n) => diaSP(Date.now() - n * 864e5);
  const periodo = { d1: hoje, d7: diasAtras(6), d30: diasAtras(29) }; // primeiro dia de cada período
  const noPeriodo = (dia, desde) => dia >= desde && dia <= hoje;

  let html = "";

  if (aba === "resumo") {
    // métricas do site (store "metricas": "AAAA-MM-DD#n")
    const met = getStore("metricas");
    const chavesMet = (await met.list()).blobs.map((b) => b.key).filter((k) => k.slice(0, 10) >= periodo.d30);
    const dias = await Promise.all(chavesMet.map(async (k) => ({ dia: k.slice(0, 10), m: (await met.get(k, { type: "json" })) || { n: {} } })));
    const soma = (t, desde) => dias.filter((d) => noPeriodo(d.dia, desde)).reduce((s, d) => s + (d.m.n[t] || 0), 0);
    const top = (grupo) => {
      const c = {};
      dias.forEach((d) => Object.entries(d.m[grupo] || {}).forEach(([k, v]) => (c[k] = (c[k] || 0) + v)));
      return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10);
    };
    const chDias = todasChaves.map((k) => { const d = dataDaChave(k); return d ? { dia: diaSP(d), av: avKeys.has(k) } : null; }).filter(Boolean);
    const chamadasEm = (desde) => chDias.filter((c) => noPeriodo(c.dia, desde)).length;
    const avaliadasEm = (desde) => chDias.filter((c) => c.av && noPeriodo(c.dia, desde)).length;

    let pros = [];
    try { pros = await (await fetch(`${base}/.netlify/functions/profissionais?admin=${encodeURIComponent(KEY)}`)).json(); } catch {}
    if (!Array.isArray(pros)) pros = [];
    const cadastrosEm = (desde) => pros.filter((p) => p.desde && noPeriodo(diaSP(p.desde), desde)).length;

    const linhas = [
      ["Visitas ao site", (d) => soma("visita", d)],
      ["Abriram um perfil", (d) => soma("perfil", d)],
      ["Chamadas no WhatsApp", chamadasEm],
      ["Chamadas avaliadas", avaliadasEm],
      ["Começaram o cadastro", (d) => soma("cad_inicio", d)],
      ["Enviaram o cadastro", (d) => soma("cad_envio", d)],
      ["Cadastros novos ou atualizados", cadastrosEm],
      ["Viram a página Anuncie", (d) => soma("anuncie_ver", d)],
      ["Clicaram em “Quero anunciar”", (d) => soma("anuncie_quero", d)],
    ];
    const tabela = `<table><thead><tr><th></th><th>Hoje</th><th>7 dias</th><th>30 dias</th></tr></thead><tbody>${linhas.map(([n, f]) => `<tr><td>${n}</td><td>${num(f(periodo.d1))}</td><td>${num(f(periodo.d7))}</td><td>${num(f(periodo.d30))}</td></tr>`).join("")}</tbody></table>`;

    const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
    const barra = (rot, v, max, extra = "") => `<div class="fn"><div class="fn-t"><span>${rot}</span><b>${num(v)}${extra}</b></div><i><b style="width:${max ? Math.max(2, (v / max) * 100) : 0}%"></b></i></div>`;
    const v30 = soma("visita", periodo.d30), p30 = soma("perfil", periodo.d30), c30 = chamadasEm(periodo.d30);
    const ci30 = soma("cad_inicio", periodo.d30), ce30 = soma("cad_envio", periodo.d30);
    const lista = (titulo, itens, vazio) => `<div class="cx"><h3>${titulo}</h3>${itens.length ? `<ol>${itens.map(([k, v]) => `<li><span>${esc(k)}</span><b>${num(v)}</b></li>`).join("")}</ol>` : `<p class="vz">${vazio}</p>`}</div>`;

    html = `
      <section class="cx"><h3>Números</h3>${tabela}<p class="obs">Visitas contam uma vez por pessoa a cada vez que ela abre o site. A contagem começou no dia em que essa versão subiu.</p></section>
      <section class="cx"><h3>Funil de clientes · 30 dias</h3>
        ${barra("Visitaram o site", v30, v30)}
        ${barra("Abriram um perfil", p30, v30, ` <small>${pct(p30, v30)}</small>`)}
        ${barra("Chamaram no WhatsApp", c30, v30, ` <small>${pct(c30, v30)}</small>`)}
      </section>
      <section class="cx"><h3>Funil de profissionais · 30 dias</h3>
        ${barra("Começaram o cadastro", ci30, ci30)}
        ${barra("Enviaram o cadastro", ce30, ci30, ` <small>${pct(ce30, ci30)}</small>`)}
        <p class="obs">Quem começou e não enviou desistiu no meio. Se a diferença for grande, vale simplificar alguma pergunta.</p>
      </section>
      <div class="duas">
        ${lista("Serviços mais clicados", top("cats"), "Ninguém escolheu um serviço ainda.")}
        ${lista("Mais buscados", top("buscas"), "Nenhuma busca ainda.")}
        ${lista("Buscaram e não acharam ninguém", top("vazias"), "Nenhuma busca sem resultado. Ótimo!")}
        ${lista("Serviços mais chamados", top("chamados"), "Nenhuma chamada ainda.")}
      </div>
      <p class="obs" style="padding:0 4px">“Buscaram e não acharam” mostra que tipo de profissional falta cadastrar.</p>`;
  }

  if (aba === "profissionais") {
    let pros = [], erro = "";
    try {
      const r = await fetch(`${base}/.netlify/functions/profissionais?admin=${encodeURIComponent(KEY)}`);
      pros = await r.json();
      if (!Array.isArray(pros)) { erro = (pros && pros.erro) || "Não deu para carregar."; pros = []; }
    } catch (e) { erro = "Não deu para carregar a lista."; }
    // chamadas por profissional
    const conta = {};
    await Promise.all(todasChaves.slice(0, 500).map(async (k) => {
      const ch = await chamadas.get(k, { type: "json" });
      if (ch && ch.profissionalWhatsapp) conta[ch.profissionalWhatsapp] = (conta[ch.profissionalWhatsapp] || 0) + 1;
    }));
    const aviso = url.searchParams.get("aviso");
    const visiveis = pros.filter((p) => !p.oculto).length;
    html = `
      ${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ""}
      ${erro ? `<p class="aviso ruim">${esc(erro)}</p>` : ""}
      <div class="topo-pro"><input id="filtro" type="search" placeholder="Procurar por nome, serviço ou cidade" aria-label="Procurar profissional"><span>${visiveis} no site · ${pros.length - visiveis} ocultos</span></div>
      ${pros.map((p) => {
        const nome1 = String(p.nome).split(" ")[0];
        const msg = `Oi, ${nome1}! Aqui é da Kiiro 💛 Para atualizar seu perfil (foto, serviços, cidades ou fotos de trabalhos), é só preencher de novo com o mesmo WhatsApp: ${base}/cadastro . Suas avaliações continuam.`;
        const form = (acao, rot, cls, confirma) => `<form method="post" action="/painel"${confirma ? ` onsubmit="return confirm('${confirma}')"` : ""}><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="w" value="${esc(p.whatsapp)}"><input type="hidden" name="ids" value="${esc((p.ids || [p.id]).join(","))}"><button class="b ${cls}" type="submit">${rot}</button></form>`;
        return `
        <article class="pro ${p.oculto ? "oculto" : ""}" data-busca="${esc((p.nome + " " + (p.categorias || []).join(" ") + " " + p.cidade).toLowerCase())}">
          <div class="pro-l">
            ${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : `<span class="ini">${esc(String(p.nome)[0] || "?")}</span>`}
            <div>
              <b>${esc(p.nome)}</b> ${p.oculto ? `<span class="st ruim">Oculto</span>` : ""}
              <p>${esc((p.categorias || []).join(" · "))}<br>${esc(p.cidade)}</p>
              <p class="mini">${p.avaliacoes ? `★ ${String(p.nota).replace(".", ",")} (${p.avaliacoes})` : "Sem avaliações"} · ${conta[p.whatsapp] || 0} chamada${(conta[p.whatsapp] || 0) === 1 ? "" : "s"} · desde ${p.desde ? fmt(p.desde).slice(0, 5) : "–"}${(p.ids || []).length > 1 ? ` · ${(p.ids || []).length} cadastros` : ""}</p>
            </div>
          </div>
          <div class="acoes">
            <a class="b" href="${base}/#p-${esc(p.id)}" target="_blank" rel="noopener">Ver no site</a>
            <a class="b" href="https://wa.me/${esc(p.whatsapp)}" target="_blank" rel="noopener">${tel(esc(p.whatsapp))}</a>
            <a class="b" href="https://wa.me/${esc(p.whatsapp)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Pedir atualização</a>
            ${p.oculto ? form("mostrar", "Mostrar de novo", "zap") : form("ocultar", "Ocultar do site", "")}
            ${form("excluir", "Excluir", "perigo", `Excluir o cadastro de ${String(p.nome).replace(/['"\\]/g, "")}? Isso apaga do Netlify e não dá para desfazer.`)}
          </div>
        </article>`;
      }).join("") || '<p class="vazio">Nenhum profissional cadastrado ainda.</p>'}
      <p class="obs">Ocultar tira do site na hora e dá para voltar. Excluir apaga o cadastro (e os cadastros antigos com o mesmo WhatsApp). As avaliações ficam guardadas: se a pessoa se cadastrar de novo, elas voltam.</p>
      <script>
        const f = document.getElementById("filtro");
        f && f.addEventListener("input", () => { const t = f.value.toLowerCase().trim(); document.querySelectorAll(".pro").forEach(a => a.style.display = !t || a.dataset.busca.includes(t) ? "" : "none"); });
      </script>`;
  }

  if (aba === "chamadas") {
    const chaves = todasChaves.slice(0, 300);
    const itens = (await Promise.all(chaves.map(async (k) => {
      const ch = await chamadas.get(k, { type: "json" });
      if (!ch) return null;
      const av = avKeys.has(k) ? await avaliacoes.get(k, { type: "json" }) : null;
      return { k, ch, av };
    }))).filter(Boolean);
    const ruim = (i) => i.av && (i.av.feito === "nao" || i.av.nota <= 2);
    const pendentes = itens.filter((i) => !i.av).length;
    const ruins = itens.filter(ruim).length;
    const lista = itens.filter((i) => (filtro === "pendentes" ? !i.av : filtro === "atencao" ? ruim(i) : true));
    const sub = (v, t, n) => `<a class="aba mini ${filtro === v ? "on" : ""}" href="${q({ aba: "chamadas", ver: v })}">${t} <small>${n}</small></a>`;
    html = `<nav class="abas sub">${sub("todas", "Todas", itens.length)}${sub("pendentes", "Pedir avaliação", pendentes)}${sub("atencao", "Atenção", ruins)}</nav>` +
      (lista.map(({ k, ch, av }) => {
        const primeiro = String(ch.clienteNome).split(" ")[0];
        const profPrimeiro = String(ch.profissionalNome).split(" ")[0];
        const link = `${base}/avaliar?c=${encodeURIComponent(k)}`;
        const msg = `Oi, ${primeiro}! Aqui é da Kiiro 💛 Deu certo com ${profPrimeiro}? Leva 10 segundos para avaliar: ${link}`;
        let status;
        if (!av) status = `<span class="st pend">Aguardando avaliação</span>`;
        else if (av.feito === "nao") status = `<span class="st ruim">Não fechou · ${esc(av.motivo)}</span>`;
        else status = `<span class="st ${av.nota <= 2 ? "ruim" : "bom"}">${"★".repeat(av.nota)}${"☆".repeat(5 - av.nota)} ${av.nota}</span>`;
        return `
        <article>
          <div class="l1"><b>${esc(ch.clienteNome)}</b><span>${fmt(ch.data)}</span></div>
          <p>chamou <b>${esc(ch.profissionalNome)}</b> · ${esc(ch.categoria)} · ${esc(ch.cidade)}</p>
          ${status}
          ${av && av.comentario ? `<blockquote>“${esc(av.comentario)}”</blockquote>` : ""}
          ${av && av.fotoId ? `<div class="foto"><a href="/.netlify/functions/foto?id=${esc(av.fotoId)}" target="_blank" rel="noopener"><img src="/.netlify/functions/foto?id=${esc(av.fotoId)}" alt="Foto do serviço" loading="lazy"></a><a class="b" href="${q({ aba: "chamadas", ver: filtro, ocultar: k })}">Ocultar foto</a></div>` : ""}
          <div class="acoes">
            ${!av ? `<a class="b zap" href="https://wa.me/${esc(ch.clienteWhatsapp)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Pedir avaliação</a>` : ""}
            <a class="b" href="https://wa.me/${esc(ch.clienteWhatsapp)}" target="_blank" rel="noopener">${tel(esc(ch.clienteWhatsapp))}</a>
          </div>
        </article>`;
      }).join("") || '<p class="vazio">Nada por aqui ainda.</p>');
  }

  const abaLink = (v, t) => `<a class="aba ${aba === v ? "on" : ""}" href="${q({ aba: v })}">${t}</a>`;
  const pagina = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="theme-color" content="#FFFAEA"><title>Kiiro · Painel</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Poppins,system-ui,sans-serif;background:#FFFAEA;color:#1A1A1A}
header{position:sticky;top:0;z-index:5;background:#FFFAEA;border-bottom:1px solid #EFE6C8;padding:14px 14px 0}
header .in{max-width:760px;margin:auto}
header h1{font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px}
header h1 i{width:12px;height:12px;border-radius:50%;background:#FFC800;display:inline-block}
.abas{display:flex;gap:6px;overflow-x:auto;padding:10px 0 0}
.aba{flex:none;padding:8px 14px 10px;font-weight:500;font-size:15px;text-decoration:none;color:#5E574A;border-bottom:3px solid transparent}
.aba.on{color:#1A1A1A;font-weight:600;border-bottom-color:#FFC800}
.abas.sub{padding:0 0 12px}
.aba.mini{border:1px solid #EFE6C8;border-radius:999px;background:#fff;padding:5px 12px;font-size:13px}
.aba.mini.on{background:#1A1A1A;color:#FFC800;border-color:#1A1A1A}
main{padding:14px;max-width:760px;margin:auto}
.cx,article{background:#fff;border:1px solid #EFE6C8;border-radius:16px;padding:14px;margin-bottom:12px}
.cx h3{font-size:15px;font-weight:600;margin-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{font-size:12px;color:#5E574A;font-weight:500;text-align:right;padding:4px}
td{padding:7px 4px;border-top:1px solid #F3ECD4;text-align:right;font-weight:600}
td:first-child{text-align:left;font-weight:400}
.obs{font-size:12px;color:#6B6455;margin-top:8px;line-height:1.5}
.fn{margin-bottom:10px}.fn-t{display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px}.fn-t small{color:#6B6455;font-weight:500}
.fn i{display:block;height:10px;border-radius:10px;background:#F3ECD4;overflow:hidden}.fn i b{display:block;height:100%;background:#FFC800;border-radius:10px}
.duas{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.duas .cx{margin:0}
ol{list-style:none;display:grid;gap:4px;font-size:14px}ol li{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #F3ECD4;padding-top:4px}
.vz{font-size:13px;color:#6B6455}
.l1{display:flex;justify-content:space-between;gap:8px}.l1 span{color:#5E574A;font-size:13px}
article p{margin:4px 0 8px;font-size:14px;line-height:1.45}
.st{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:3px 10px}
.pend{background:#FFF3C4}.bom{background:#DDF3E4;color:#0E5C2C}.ruim{background:#FFE4DE;color:#8A1C0E}
blockquote{margin-top:8px;font-size:14px;color:#5E574A;border-left:3px solid #FFC800;padding-left:10px}
.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.acoes form{display:inline}
.b{display:inline-block;border:1px solid #1A1A1A;background:#fff;border-radius:10px;padding:7px 12px;font:600 13px Poppins,sans-serif;text-decoration:none;color:#1A1A1A;cursor:pointer}
.b.zap{background:#FFC800;border-color:#FFC800}
.b.perigo{border-color:#B3261E;color:#B3261E}
.vazio{text-align:center;color:#5E574A;padding:40px 0}
.foto{display:flex;gap:10px;align-items:flex-end;margin-top:10px}.foto img{width:96px;height:96px;object-fit:cover;border-radius:12px}
.aviso{background:#FFF3C4;border:1px solid #F0DC92;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:14px;font-weight:500}
.aviso.ruim{background:#FFE4DE;border-color:#F3B8AC}
.topo-pro{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.topo-pro input{flex:1;min-width:200px;border:1px solid #EFE6C8;border-radius:999px;padding:10px 14px;font:14px Poppins,sans-serif;background:#fff}
.topo-pro span{font-size:13px;color:#5E574A}
.pro-l{display:flex;gap:12px}
.pro-l img,.pro-l .ini{width:64px;height:64px;border-radius:14px;object-fit:cover;flex:none;background:#FFC800;display:grid;place-items:center;font-weight:700;font-size:24px}
.pro .mini{font-size:12px;color:#5E574A;margin:0}
.pro.oculto{opacity:.65}
</style></head><body>
<header><div class="in">
  <h1><i></i>Painel da Kiiro</h1>
  <nav class="abas">${abaLink("resumo", "Resumo")}${abaLink("profissionais", "Profissionais")}${abaLink("chamadas", "Chamadas")}</nav>
</div></header>
<main>${html}</main>
</body></html>`;

  return new Response(pagina, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
};
