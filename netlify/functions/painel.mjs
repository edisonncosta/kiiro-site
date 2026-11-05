// Kiiro — seu painel.
// Endereço: /painel?chave=SUA_ADMIN_KEY
// Abas: Resumo (acessos e funil) · Profissionais (ocultar, mostrar, excluir) · Chamadas (quem chamou quem, e como foi)
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { enviarPara, inscricoes } from "../lib/push.mjs";
import { lerLembretes, salvarLembretes, diaSP as hojeLb } from "../lib/lembretes.mjs";
import { localDe } from "../lib/local.mjs";
import { todasContas, apagarConta, lerConta, salvarConta, donoDoWhats, soltarWhats, novaProvisoria, guardarProvisoria, msgProvisoria } from "../lib/contas.mjs";
import { lerFaturas, salvarFaturas, lerPrecos, valorDe, novoId, somaMeses, somaDias, br as brF, reais, NOMES as NOMES_F } from "../lib/faturas.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TZ = "America/Sao_Paulo";
const API = "https://api.netlify.com/api/v1";
const fmt = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const diaSP = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ }); // AAAA-MM-DD
const tel = (n) => String(n).replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
const num = (n) => Number(n || 0).toLocaleString("pt-BR");
// chave de chamada = "2026-11-02T05-10-00-000Z_abc123" → data
const dataDaChave = (k) => { const m = String(k).match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/); return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null; };

export default async (req, context) => {
  const url = new URL(req.url);
  const KEY = process.env.ADMIN_KEY;
  const formPost = req.method === "POST" ? await req.formData().catch(() => null) : null;
  const chave = url.searchParams.get("chave") || (formPost && formPost.get("chave"));
  if (!KEY || chave !== KEY) return new Response("Acesso negado", { status: 401 });
  const q = (extra = {}) => "?" + new URLSearchParams({ chave: KEY, ...extra }).toString();
  const aba = url.searchParams.get("aba") || "resumo";
  const filtro = url.searchParams.get("ver") || "todas";
  const base = url.origin;

  /* ---------- ações ---------- */
  if (req.method === "POST") {
    const f = formPost || new FormData();
    const acao = f.get("acao");
    // ----- pagamentos (faturas dos anúncios)
    if (String(acao || "").startsWith("pg_")) {
      const id = String(f.get("id") || "").replace(/[^\w-]/g, "");
      const faturas = await lerFaturas();
      const admin = getStore("admin");
      const lista = (await admin.get("anuncios", { type: "json" })) || {};
      const hojeP = diaSP(Date.now());
      let aviso = "";
      const fat = faturas[id];
      if ((acao === "pg_confirmar" || acao === "pg_cortesia") && fat) {
        const cortesia = acao === "pg_cortesia";
        fat.status = cortesia ? "cortesia" : "pago"; fat.pagoEm = new Date().toISOString();
        // renovação já ligada a um anúncio: estende o prazo dele sozinho
        const an = fat.anuncio && lista[fat.anuncio];
        if (an && fat.tipo === "renovacao" && !fat.aplicado) {
          const desde = an.ate && an.ate >= hojeP ? an.ate : hojeP;
          const ate = somaMeses(desde, fat.meses || 1);
          for (const k of [fat.anuncio, fat.anuncio + "-g"]) if (lista[k]) { lista[k].ate = ate; lista[k].pausado = false; }
          fat.aplicado = true;
          await admin.setJSON("anuncios", lista);
          aviso = `${cortesia ? "Cortesia registrada 💛" : "Pagamento confirmado ✓"} O anúncio da ${fat.empresa} ficou no ar até ${brF(ate)}.`;
        } else aviso = cortesia ? `${fat.empresa} marcado como cortesia 💛` : `Pagamento de ${fat.empresa} confirmado ✓`;
      }
      if (acao === "pg_reabrir" && fat) { fat.status = "pendente"; delete fat.pagoEm; aviso = "Fatura voltou para Em aberto."; }
      // lançamento avulso: patrocinador colocado à mão, pagamento feito por fora ou cortesia
      if (acao === "pg_avulsa") {
        const empresa = String(f.get("empresa") || "").trim().slice(0, 60);
        const sit = ["pago", "cortesia", "pendente"].includes(f.get("situacao")) ? f.get("situacao") : "pago";
        const meses = Math.min(12, Math.max(1, parseInt(f.get("meses"), 10) || 1));
        const valor = parseFloat(String(f.get("valor") || "").replace(",", ".")) || 0;
        const inicio = /^\d{4}-\d{2}-\d{2}$/.test(f.get("inicio") || "") ? f.get("inicio") : hojeP;
        if (!empresa) aviso = "Informe o nome da empresa.";
        else if (sit !== "cortesia" && !(valor > 0)) aviso = "Informe o valor (ou marque como cortesia).";
        else {
          const nid = novoId();
          faturas[nid] = {
            id: nid, tipo: "avulsa", empresa, contato: String(f.get("contato") || "").slice(0, 20), formato: "", meses, valor,
            descricao: String(f.get("descricao") || "").trim().slice(0, 80) || "Patrocínio Kiiro",
            periodo: `${brF(inicio)} a ${brF(somaDias(somaMeses(inicio, meses), -1))}`, inicio, fim: somaDias(somaMeses(inicio, meses), -1), vence: inicio, anuncio: String(f.get("anuncio") || ""),
            status: sit, criada: new Date().toISOString(), ...(sit !== "pendente" ? { pagoEm: new Date().toISOString() } : {}),
          };
          aviso = sit === "cortesia" ? `Cortesia de ${empresa} registrada 💛` : sit === "pago" ? `Pagamento de ${empresa} registrado ✓` : `Fatura de ${empresa} criada.`;
        }
      }
      if (acao === "pg_cancelar" && fat) { fat.status = "cancelada"; aviso = "Fatura cancelada."; }
      if (acao === "pg_nova") {
        const anId = String(f.get("anuncio") || "");
        const an = lista[anId];
        const meses = Math.min(12, Math.max(1, parseInt(f.get("meses"), 10) || 1));
        if (!an) aviso = "Escolha o anúncio.";
        else {
          let valor = parseFloat(String(f.get("valor") || "").replace(",", "."));
          if (!(valor > 0)) valor = valorDe((await lerPrecos(base)).precos, an.formato === "temporada" ? "inicio" : an.formato, meses);
          const desde = an.ate && an.ate >= hojeP ? somaDias(an.ate, 1) : hojeP;
          const fim = somaDias(somaMeses(desde, meses), -1);
          const nid = novoId();
          faturas[nid] = {
            id: nid, tipo: "renovacao", anuncio: anId, empresa: an.nome, contato: an.contato || "", formato: an.formato || "", meses, valor,
            descricao: `${NOMES_F[an.formato] || "Anúncio"}${an.alvoCidade ? " · " + an.alvoCidade : ""}${an.categoria && an.categoria !== "Todos" ? " · " + an.categoria : ""} · renovação`,
            periodo: `${brF(desde)} a ${brF(fim)}`, inicio: desde, fim, vence: an.ate && an.ate >= hojeP ? an.ate : somaDias(hojeP, 3),
            status: "pendente", criada: new Date().toISOString(),
          };
          aviso = `Fatura de ${reais(valor)} criada para ${an.nome}. Toque em “Cobrar no WhatsApp” para mandar o link.`;
        }
      }
      await salvarFaturas(faturas);
      const volta = String(f.get("volta") || "").replace(/[^\w-]/g, "");
      return Response.redirect(`${base}/painel${q({ aba: "pagamentos", ...(volta ? { e: volta } : {}), aviso })}`, 303);
    }
    // ----- anúncios enviados pelas empresas (form "anuncio")
    if (String(acao || "").startsWith("an_")) {
      const id = String(f.get("id") || "").replace(/[^\w-]/g, "");
      const admin = getStore("admin");
      const lista = (await admin.get("anuncios", { type: "json" })) || {};
      const recusados = new Set((await admin.get("anunciosRecusados", { type: "json" })) || []);
      let aviso = "";
      if (acao === "an_aprovar" && id) {
        const r = await fetch(`${API}/submissions/${id}`, { headers: { Authorization: `Bearer ${process.env.NETLIFY_TOKEN}` } });
        const sub = r.ok ? await r.json() : null;
        const d = (sub && sub.data) || {};
        if (!sub) aviso = "Não achei esse pedido no Netlify.";
        else {
          // copia a arte para o site (o link do Netlify Forms pode expirar)
          let banner = "";
          const arte = d.banner && (d.banner.url || (typeof d.banner === "string" ? d.banner : ""));
          if (arte) {
            try {
              const img = await fetch(arte);
              if (img.ok) { const fid = randomUUID(); await getStore("fotos").set(fid, await img.arrayBuffer()); banner = `/.netlify/functions/foto?id=${fid}`; }
            } catch {}
          }
          const formato = String(d.formato || "");
          const naCidade = formato === "servico_cidade" || formato === "cidade";
          const porGrupo = formato === "servico_cidade" || formato === "servico";
          const acaoBt = String(d.acao || "whatsapp");
          const destino = String(d.destino || "").trim();
          let link = "#";
          if (acaoBt === "whatsapp") { let n = destino.replace(/\D/g, ""); if (n.length === 10 || n.length === 11) n = "55" + n; link = `https://wa.me/${n}?text=${encodeURIComponent("Olá! Vi vocês na Kiiro.")}`; }
          else if (acaoBt === "localizacao") link = /^https?:\/\//i.test(destino) ? destino : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`;
          else link = /^https?:\/\//i.test(destino) ? destino : `https://${destino.replace(/^\/+/, "")}`;
          const ate = String(f.get("ate") || "").match(/^\d{4}-\d{2}-\d{2}$/) ? f.get("ate") : "";
          const base1 = {
            id, nome: String(d.empresa || "").slice(0, 60), cidade: naCidade ? String(d.cidade || "") : "",
            texto: String(d.texto || "").slice(0, 90), botao: String(d.botao || "Saber mais").slice(0, 28), link,
            banner, cor: /^#[0-9a-f]{6}$/i.test(d.cor || "") ? d.cor : "#ffffff", ate, contato: String(d.contato || ""),
            formato, meses: String(d.meses || ""), aprovadoEm: new Date().toISOString(), pausado: false,
            endereco: String(d.endereco || "").slice(0, 200),
          };
          // ponto no mapa: localização do celular na loja, ou o endereço, ou o destino do botão "localização"
          base1.local = (await localDe(d.local)) || (await localDe(d.endereco)) || (acaoBt === "localizacao" ? await localDe(destino) : null) || undefined;
          if (formato === "temporada") {
            lista[id] = { ...base1, categoria: "Todos", alvoCidade: "" };
            if (d.grupo) lista[id + "-g"] = { ...base1, id: id + "-g", categoria: String(d.grupo), alvoCidade: "" };
          } else {
            lista[id] = { ...base1, categoria: porGrupo ? String(d.grupo || "Todos") : "Todos", alvoCidade: naCidade ? String(d.cidade || "") : "" };
          }
          recusados.delete(id);
          if (d.codigo) {
            const faturas = await lerFaturas();
            const ft = faturas[String(d.codigo)];
            if (ft) { ft.anuncio = id; if (ate) { ft.inicio = diaSP(Date.now()); ft.fim = ate; ft.periodo = `${brF(ft.inicio)} a ${brF(ate)}`; } await salvarFaturas(faturas); }
          }
          aviso = `Anúncio da ${base1.nome} aprovado! Já aparece no site.` + (base1.local ? " O logo também está no mapa." : base1.endereco ? " Não achei o endereço no mapa: corrija em 📍 Lugar no mapa." : "");
        }
      }
      if (acao === "an_pausar" && lista[id]) { lista[id].pausado = true; if (lista[id + "-g"]) lista[id + "-g"].pausado = true; aviso = "Anúncio pausado."; }
      if (acao === "an_retomar" && lista[id]) { lista[id].pausado = false; if (lista[id + "-g"]) lista[id + "-g"].pausado = false; aviso = "Anúncio no ar de novo."; }
      if (acao === "an_prazo" && lista[id]) { const ate = String(f.get("ate") || ""); if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) { lista[id].ate = ate; if (lista[id + "-g"]) lista[id + "-g"].ate = ate; aviso = "Prazo atualizado."; } }
      if (acao === "an_remover") {
        for (const k of [id, id + "-g"]) { const b = lista[k] && lista[k].banner; if (b) { const fid = b.split("id=")[1]; if (fid) await getStore("fotos").delete(fid); } delete lista[k]; }
        aviso = "Anúncio removido do site.";
      }
      if (acao === "an_local" && lista[id]) {
        const end = String(f.get("endereco") || "").trim().slice(0, 200);
        if (!end) { for (const k of [id, id + "-g"]) if (lista[k]) { delete lista[k].local; lista[k].endereco = ""; } aviso = "Tirei o logo do mapa."; }
        else {
          const c = await localDe(end);
          if (c) { for (const k of [id, id + "-g"]) if (lista[k]) { lista[k].local = c; lista[k].endereco = end; } aviso = "Lugar no mapa atualizado ✓"; }
          else aviso = "Não achei esse endereço. Tente com rua e cidade, ou cole o link da loja no Google Maps.";
        }
      }
      if (acao === "an_recusar") { recusados.add(id); aviso = "Pedido recusado (não aparece mais na lista)."; }
      await admin.setJSON("anuncios", lista);
      await admin.setJSON("anunciosRecusados", [...recusados]);
      return Response.redirect(`${base}/painel${q({ aba: "anuncios", aviso })}`, 303);
    }
    // ----- disparos: modelos de mensagem + fila de envio pelo WhatsApp (um toque por profissional)
    if (String(acao || "").startsWith("dp_")) {
      const admin = getStore("admin");
      let aviso = "", extra = {};
      if (acao === "dp_tpl_salvar") {
        const lista = await lerModelos(admin);
        const id = String(f.get("id") || "") || randomUUID().slice(0, 8);
        const nome = String(f.get("nome") || "").trim().slice(0, 60), texto = String(f.get("texto") || "").trim().slice(0, 2000);
        if (nome && texto) {
          const m = lista.find((x) => x.id === id);
          if (m) Object.assign(m, { nome, texto }); else lista.push({ id, nome, texto });
          await admin.setJSON("modelos", lista); aviso = "Modelo salvo.";
        } else aviso = "Coloque nome e texto do modelo.";
      }
      if (acao === "dp_tpl_apagar") {
        const lista = (await lerModelos(admin)).filter((x) => x.id !== f.get("id"));
        await admin.setJSON("modelos", lista); aviso = "Modelo apagado.";
      }
      if (acao === "dp_criar") {
        const m = (await lerModelos(admin)).find((x) => x.id === f.get("modelo"));
        if (m) {
          const camps = (await admin.get("campanhas", { type: "json" })) || [];
          const c = { id: randomUUID().slice(0, 8), nome: m.nome, texto: m.texto, cidade: String(f.get("cidade") || ""), servico: String(f.get("servico") || ""), criada: new Date().toISOString(), enviados: {}, pulados: {} };
          camps.unshift(c); await admin.setJSON("campanhas", camps.slice(0, 20));
          aviso = "Fila criada. Toque em Enviar em cada um."; extra = { c: c.id };
        }
      }
      if (acao === "dp_enviar" || acao === "dp_pular" || acao === "dp_desfazer") {
        const camps = (await admin.get("campanhas", { type: "json" })) || [];
        const c = camps.find((x) => x.id === f.get("c"));
        const w = String(f.get("w") || "").replace(/\D/g, "");
        if (c && w) {
          if (acao === "dp_enviar") { c.enviados[w] = new Date().toISOString(); delete c.pulados[w]; }
          if (acao === "dp_pular") c.pulados[w] = new Date().toISOString();
          if (acao === "dp_desfazer") { delete c.enviados[w]; delete c.pulados[w]; }
          await admin.setJSON("campanhas", camps);
          if (acao === "dp_enviar") return Response.redirect(`https://wa.me/${w}?text=${encodeURIComponent(String(f.get("texto") || ""))}`, 303);
        }
        extra = { c: String(f.get("c") || "") };
      }
      if (acao === "dp_apagar") {
        const camps = ((await admin.get("campanhas", { type: "json" })) || []).filter((x) => x.id !== f.get("c"));
        await admin.setJSON("campanhas", camps); aviso = "Fila apagada.";
      }
      return Response.redirect(`${base}/painel${q({ aba: "disparos", ...extra, ...(aviso ? { aviso } : {}) })}`, 303);
    }
    // ----- contas (sem confirmação por código: aqui dá para soltar o WhatsApp ou apagar a conta)
    if (String(acao || "").startsWith("ct_")) {
      const login = String(f.get("login") || "");
      let aviso = "";
      const c = login && (await lerConta(login));
      if (c && acao === "ct_soltar" && c.whats) {
        if ((await donoDoWhats(c.whats)) === login) await soltarWhats(c.whats);
        delete c.whats; await salvarConta(c); aviso = "WhatsApp desligado da conta.";
      }
      if (c && acao === "ct_senha") {
        const senha = novaProvisoria();
        guardarProvisoria(c, senha); await salvarConta(c);
        return Response.redirect(`https://wa.me/${c.login}?text=${encodeURIComponent(msgProvisoria(c, senha, base))}`, 303);
      }
      if (c && acao === "ct_apagar") { await apagarConta(login); aviso = "Conta apagada. A pessoa pode criar de novo."; }
      return Response.redirect(`${base}/painel${q({ aba: "contas", aviso })}`, 303);
    }
    // ----- indicações (aprovar antes de aparecer no perfil)
    if (String(acao || "").startsWith("in_")) {
      const id = String(f.get("id") || "").replace(/[^\w-]/g, "");
      const st = getStore("indicacoes");
      const x = id && (await st.get(id, { type: "json" }));
      let aviso = "";
      if (x && acao === "in_aprovar") { await st.setJSON(id, { ...x, status: "aprovada" }); aviso = "Aprovada. Já aparece no perfil."; }
      if (x && acao === "in_ocultar") { await st.setJSON(id, { ...x, status: "pendente" }); aviso = "Tirada do perfil."; }
      if (x && acao === "in_excluir") { await st.delete(id); aviso = "Excluída."; }
      return Response.redirect(`${base}/painel${q({ aba: "indicacoes", aviso })}`, 303);
    }
    // ----- pedidos de orçamento (chat do site)
    if (String(acao || "").startsWith("pd_")) {
      const id = String(f.get("id") || "").replace(/[^\w-]/g, "");
      const pedidos = getStore("pedidos");
      const p = id && (await pedidos.get(id, { type: "json" }));
      let aviso = "";
      if (p && acao === "pd_atendido") { await pedidos.setJSON(id, { ...p, status: "atendido" }); aviso = "Pedido marcado como atendido."; }
      if (p && acao === "pd_novo") { await pedidos.setJSON(id, { ...p, status: "novo" }); aviso = "Pedido voltou para abertos."; }
      if (p && acao === "pd_excluir") { await pedidos.delete(id); aviso = "Pedido excluído."; }
      return Response.redirect(`${base}/painel${q({ aba: "pedidos", aviso })}`, 303);
    }
    // ----- seus lembretes
    if (String(acao || "").startsWith("lb_")) {
      const lista = await lerLembretes();
      const id = String(f.get("id") || "").replace(/[^\w-]/g, "");
      let aviso = "";
      if (acao === "lb_criar") {
        const titulo = String(f.get("titulo") || "").trim().slice(0, 80);
        const data = String(f.get("data") || "");
        if (!titulo || !/^\d{4}-\d{2}-\d{2}$/.test(data)) aviso = "Coloque o que lembrar e a data.";
        else {
          let link = String(f.get("link") || "").trim().slice(0, 300);
          if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
          lista.push({ id: randomUUID().slice(0, 8), titulo, data, nota: String(f.get("nota") || "").trim().slice(0, 300), link, feito: false, avisos: {} });
          aviso = "Lembrete criado. Você recebe o aviso no celular um dia antes, às 9h.";
        }
      }
      const l = lista.find((x) => x.id === id);
      if (l && acao === "lb_feito") { l.feito = true; aviso = "Marcado como feito ✓"; }
      if (l && acao === "lb_reabrir") { l.feito = false; l.avisos = {}; aviso = "Lembrete reaberto."; }
      if (l && acao === "lb_apagar") { lista.splice(lista.indexOf(l), 1); aviso = "Lembrete apagado."; }
      lista.sort((a, b) => String(a.data).localeCompare(String(b.data)));
      await salvarLembretes(lista);
      return Response.redirect(`${base}/painel${q({ aba: "lembretes", aviso })}`, 303);
    }
    // ----- avisos no celular (notificações): mandar um aviso para quem ativou
    if (acao === "push_enviar") {
      const para = ["pro", "cliente"].includes(String(f.get("para"))) ? String(f.get("para")) : "";
      const titulo = String(f.get("titulo") || "").trim().slice(0, 60);
      const texto = String(f.get("texto") || "").trim().slice(0, 180);
      let link = String(f.get("link") || "").trim().slice(0, 300);
      if (link && !/^(https?:\/\/|\/)/.test(link)) link = "/" + link;
      let aviso = "Escreva o título e o texto do aviso.";
      if (titulo && texto) {
        const n = await enviarPara({ tipo: para }, { title: titulo, body: texto, url: link || "/", tag: "kiiro-painel-" + Date.now() });
        aviso = n ? `Aviso enviado para ${n} ${n > 1 ? "aparelhos" : "aparelho"}.` : "Ninguém desse grupo ativou os avisos ainda.";
      }
      return Response.redirect(`${base}/painel${q({ aba: "avisos", aviso })}`, 303);
    }
    const w = String(f.get("w") || "").replace(/\D/g, "");
    const admin = getStore("admin");
    // pedir doação: guarda a data e abre o WhatsApp do profissional com o texto (o link /d/ID mostra a imagem)
    if (acao === "doacao_pedir" && w) {
      const texto = String(f.get("texto") || "").trim().slice(0, 1500);
      const log = (await admin.get("doacoesPedidas", { type: "json" })) || {};
      (log[w] ||= []).push(new Date().toISOString());
      log[w] = log[w].slice(-20);
      await admin.setJSON("doacoesPedidas", log);
      return Response.redirect(`https://wa.me/${w}?text=${encodeURIComponent(texto)}`, 303);
    }
    const ocultos = new Set((await admin.get("ocultos", { type: "json" })) || []);
    let aviso = "";
    if (acao === "ocultar" && w) { ocultos.add(w); aviso = "Profissional ocultado do site."; }
    if (acao === "mostrar" && w) { ocultos.delete(w); aviso = "Profissional aparece no site de novo."; }
    if ((acao === "foto" || acao === "trabalhos" || acao === "foto_original" || acao === "trabalhos_original") && w) {
      const fotos = getStore("fotos");
      const trocas = (await admin.get("fotosPro", { type: "json" })) || {};
      const t = (trocas[w] ||= {});
      const salvar = async (arq) => {
        if (!arq || typeof arq === "string" || !arq.size) return null;
        if (arq.size > 3 * 1024 * 1024) throw new Error("grande");
        const id = randomUUID();
        await fotos.set(id, await arq.arrayBuffer());
        return id;
      };
      try {
        if (acao === "foto") {
          const id = await salvar(f.get("arquivo"));
          if (id) { if (t.foto) await fotos.delete(t.foto); t.foto = id; aviso = "Foto trocada! Já aparece no site."; }
          else aviso = "Escolha uma foto.";
        }
        if (acao === "trabalhos") {
          const ids = [];
          for (const arq of f.getAll("arquivo").slice(0, 3)) { const id = await salvar(arq); if (id) ids.push(id); }
          if (ids.length) { for (const old of t.trabalhos || []) await fotos.delete(old); t.trabalhos = ids; aviso = `${ids.length} foto${ids.length > 1 ? "s" : ""} de trabalhos no perfil.`; }
          else aviso = "Escolha até 3 fotos.";
        }
        if (acao === "foto_original" && t.foto) { await fotos.delete(t.foto); delete t.foto; aviso = "Voltou a foto do cadastro."; }
        if (acao === "trabalhos_original" && t.trabalhos) { for (const old of t.trabalhos) await fotos.delete(old); delete t.trabalhos; aviso = "Voltaram as fotos de trabalhos do cadastro."; }
      } catch { aviso = "A foto é grande demais. Tente outra."; }
      if (!t.foto && !(t.trabalhos && t.trabalhos.length)) delete trocas[w];
      await admin.setJSON("fotosPro", trocas);
      if (f.get("js")) return new Response(JSON.stringify({ aviso }), { headers: { "Content-Type": "application/json" } });
    }
    if (acao === "editar" && w) {
      const edicoes = (await admin.get("editsPro", { type: "json" })) || {};
      const txt = (n, max = 60) => String(f.get(n) || "").replace(/\s+/g, " ").trim().slice(0, max);
      const categorias = [...f.getAll("servico"), f.get("servico_outro")].map((x) => String(x || "").replace(/,/g, " ").trim().slice(0, 50)).filter(Boolean).slice(0, 3);
      const ed = {
        nome: txt("nome", 60),
        categorias: [...new Set(categorias)],
        cidade: txt("cidade", 400),
        cidadeBase: txt("cidade_base", 40), raio: txt("raio", 4),
        descricao: String(f.get("descricao") || "").trim().slice(0, 400),
        experiencia: txt("experiencia"), dedicacao: txt("dedicacao"), urgencia: txt("urgencia"),
        dias: f.getAll("dias").map(String).join(", ").slice(0, 80), orcamento: txt("orcamento"), mei: txt("mei"),
        em: new Date().toISOString(),
      };
      if (!ed.nome || !ed.categorias.length || !ed.cidade) aviso = "Faltou nome, serviço ou cidade. Nada foi mudado.";
      else { edicoes[w] = ed; await admin.setJSON("editsPro", edicoes); aviso = "Dados salvos! Já aparecem no site."; }
    }
    if (acao === "desfazer_edicao" && w) {
      const edicoes = (await admin.get("editsPro", { type: "json" })) || {};
      delete edicoes[w]; await admin.setJSON("editsPro", edicoes);
      aviso = "Voltaram os dados do cadastro.";
    }
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
    return Response.redirect(`${base}/painel${q({ aba: "profissionais", aviso })}#${w}`, 303);
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
      ["Abriram o pedido de orçamento", (d) => soma("orc_abrir", d)],
      ["Enviaram pedido de orçamento", (d) => soma("orc_envio", d)],
      ["Avaliações por link", (d) => soma("indicar", d)],
      ["Usaram a localização", (d) => soma("local_usar", d)],
      ["Aceitaram ver a cidade sugerida", (d) => soma("local_sim", d)],
    ];
    const tabela = `<table><thead><tr><th></th><th>Hoje</th><th>7 dias</th><th>30 dias</th></tr></thead><tbody>${linhas.map(([n, f]) => `<tr><td>${n}</td><td>${num(f(periodo.d1))}</td><td>${num(f(periodo.d7))}</td><td>${num(f(periodo.d30))}</td></tr>`).join("")}</tbody></table>`;

    const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
    const barra = (rot, v, max, extra = "") => `<div class="fn"><div class="fn-t"><span>${rot}</span><b>${num(v)}${extra}</b></div><i><b style="width:${max ? Math.max(2, (v / max) * 100) : 0}%"></b></i></div>`;
    const v30 = soma("visita", periodo.d30), p30 = soma("perfil", periodo.d30), c30 = chamadasEm(periodo.d30);
    const ci30 = soma("cad_inicio", periodo.d30), ce30 = soma("cad_envio", periodo.d30);
    const lista = (titulo, itens, vazio) => `<div class="cx"><h3>${titulo}</h3>${itens.length ? `<ol>${itens.map(([k, v]) => `<li><span>${esc(k)}</span><b>${num(v)}</b></li>`).join("")}</ol>` : `<p class="vz">${vazio}</p>`}</div>`;

    html = `
      <section class="cx eu"><div class="eu-l"><b>Este aparelho</b><span id="eu-st">…</span></div><button class="b" type="button" id="eu-bt">…</button></section>
      <script>
        (function () {
          const st = document.getElementById("eu-st"), bt = document.getElementById("eu-bt");
          const ler = () => { try { return localStorage.getItem("kiiro-nao-contar") === "1"; } catch { return false; } };
          const mostra = () => { const fora = ler(); st.textContent = fora ? "✓ Desligado. Daqui para frente, o que você faz neste celular não entra nos números. O que já foi contado antes continua." : "Suas visitas e testes neste celular estão entrando nos números. Toque abaixo para parar de contar daqui para frente."; bt.textContent = fora ? "Voltar a contar" : "Não contar este celular"; bt.classList.toggle("zap", !fora); };
          bt.onclick = () => { try { ler() ? localStorage.removeItem("kiiro-nao-contar") : localStorage.setItem("kiiro-nao-contar", "1"); } catch {} mostra(); };
          mostra();
        })();
      </script>
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
        ${lista("De onde acessam (aproximado)", top("geo"), "A contagem por cidade começou agora.")}
        ${lista("Cidades escolhidas no site", top("cidades_esc"), "Ninguém escolheu cidade ainda.")}
      </div>
      <p class="obs" style="padding:0 4px">“Buscaram e não acharam” mostra que tipo de profissional falta cadastrar. “De onde acessam” vem da internet da pessoa e é aproximado: no 4G, a operadora às vezes mostra outra cidade, como Porto Alegre. “Cidades escolhidas” é o que a pessoa marcou na Kiiro, mais certeiro.</p>
      ${(() => {
        const vis = Object.fromEntries(top("patro_ver")), cli = Object.fromEntries(top("patro_clique"));
        const nomes = [...new Set([...Object.keys(vis), ...Object.keys(cli)])];
        return `<section class="cx" style="margin-top:12px"><h3>Patrocinadores · 30 dias</h3>${nomes.length
          ? `<table><thead><tr><th></th><th>Vezes que apareceu</th><th>Cliques</th></tr></thead><tbody>${nomes.map((n) => `<tr><td>${esc(n)}</td><td>${num(vis[n])}</td><td>${num(cli[n])}</td></tr>`).join("")}</tbody></table><p class="obs">Mande esses números para o patrocinador todo mês: mostra o retorno do anúncio.</p>`
          : `<p class="vz">Nenhum patrocinador apareceu ainda.</p>`}</section>`;
      })()}`;
  }

  if (aba === "profissionais") {
    let pros = [], erro = "";
    let doacoesPedidas = {};
    try { doacoesPedidas = (await getStore("admin").get("doacoesPedidas", { type: "json" })) || {}; } catch {}
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
    const sel = (nome, rot, opcoes, atual) => `<label class="ed-l">${rot}<select name="${nome}">${opcoes.map((o) => `<option ${o === atual ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    const formEditar = (p) => {
      const cats = p.categorias || [];
      const dias = String(p.dias || "").split(/\s*,\s*/);
      return `<form class="ed" method="post" action="/painel">
        <input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="editar"><input type="hidden" name="w" value="${esc(p.whatsapp)}">
        <label class="ed-l">Nome<input name="nome" value="${esc(p.nome)}" maxlength="60" required></label>
        <div class="ed-l">Serviços <small class="ed-conta">marque até 3</small>
          <input type="search" class="ed-busca" placeholder="Procurar serviço… ex.: piscina" autocomplete="off">
          <div class="ed-servs" data-atual="${esc(cats.join("|"))}"></div>
          <input name="servico_outro" class="ed-outro" placeholder="Outro serviço (se não estiver na lista)" maxlength="50">
        </div>
        <div class="ed-l">Cidade principal<select name="cidade_base" class="ed-base" data-atual="${esc(p.cidadeBase || "")}"></select></div>
        <div class="ed-l">Até onde atende<div class="ed-chips ed-raio">${[["0", "Só na cidade"], ["15", "15 km"], ["30", "30 km"], ["50", "50 km"]].map(([v, t]) => `<label><input type="radio" name="raio" value="${v}"${String(p.raio || "") === v ? " checked" : ""}> ${t}</label>`).join("")}</div></div>
        <div class="ed-l">Cidades onde aparece<div class="ed-cids" data-atual="${esc(p.cidade)}"></div><input type="hidden" name="cidade" value="${esc(p.cidade)}"><small class="ed-dica">Escolha a cidade principal e a distância: as cidades se marcam sozinhas. Dá para tirar ou pôr alguma tocando.</small></div>
        <label class="ed-l">Descrição<textarea name="descricao" maxlength="400" rows="4">${esc(p.descricao || "")}</textarea></label>
        <div class="ed-g">
          ${sel("experiencia", "Experiência", ["Menos de 1 ano", "1 a 3 anos", "3 a 5 anos", "Mais de 5 anos"], p.experiencia)}
          ${sel("dedicacao", "Dedicação", ["Minha profissão principal", "Uma renda extra"], p.dedicacao)}
          ${sel("urgencia", "Atende urgência", ["Sim", "Não"], p.urgencia)}
          ${sel("orcamento", "Orçamento grátis", ["Sim", "Não"], p.orcamento)}
          ${sel("mei", "Tem MEI/CNPJ", ["Sim", "Não"], p.mei)}
        </div>
        <div class="ed-l">Dias<div class="ed-dias">${["Dias de semana", "Fins de semana", "Feriados"].map((d) => `<label><input type="checkbox" name="dias" value="${d}" ${dias.includes(d) ? "checked" : ""}> ${d}</label>`).join("")}</div></div>
        <p class="obs">O WhatsApp não muda por aqui, porque é ele que liga as avaliações à pessoa. Para trocar de número, a pessoa faz um cadastro novo.</p>
        <button class="b zap" type="submit">Salvar alterações</button>
      </form>`;
    };
    const visiveis = pros.filter((p) => !p.oculto).length;
    html = `
      ${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ""}
      ${erro ? `<p class="aviso ruim">${esc(erro)}</p>` : ""}
      <div class="topo-pro"><input id="filtro" type="search" placeholder="Procurar por nome, serviço ou cidade" aria-label="Procurar profissional"><span>${visiveis} no site · ${pros.length - visiveis} ocultos</span></div>
      ${pros.map((p) => {
        const nome1 = String(p.nome).split(" ")[0];
        const msg = `Oi, ${nome1}! Aqui é da Kiiro 💛 Para atualizar seu perfil (foto, serviços, cidades ou fotos de trabalhos), é só preencher de novo com o mesmo WhatsApp: ${base}/cadastro . Suas avaliações continuam.`;
        const formFoto = (acao, rot, varias) => `<form class="ffoto" method="post" action="/painel" enctype="multipart/form-data"><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="w" value="${esc(p.whatsapp)}"><label class="b">${rot}<input type="file" name="arquivo" accept="image/*" ${varias ? "multiple" : ""} hidden></label></form>`;
        const form = (acao, rot, cls, confirma) => `<form method="post" action="/painel"${confirma ? ` onsubmit="return confirm('${confirma}')"` : ""}><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="w" value="${esc(p.whatsapp)}"><input type="hidden" name="ids" value="${esc((p.ids || [p.id]).join(","))}"><button class="b ${cls}" type="submit">${rot}</button></form>`;
        return `
        <article class="pro ${p.oculto ? "oculto" : ""}" data-editado="${p.editado ? 1 : ""}" id="${esc(p.whatsapp)}" data-busca="${esc((p.nome + " " + (p.categorias || []).join(" ") + " " + p.cidade).toLowerCase())}">
          <div class="pro-l">
            ${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : `<span class="ini">${esc(String(p.nome)[0] || "?")}</span>`}
            <div>
              <b>${esc(p.nome)}</b> ${p.oculto ? `<span class="st ruim">Oculto</span>` : ""} ${p.editado ? `<span class="st pend">Editado</span>` : ""}
              <p>${esc((p.categorias || []).join(" · "))}<br>${esc(p.cidade)}</p>
              ${(p.trabalhos || []).length ? `<div class="mini-trab">${p.trabalhos.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("")}</div>` : ""}
              <p class="mini">${p.avaliacoes ? `★ ${String(p.nota).replace(".", ",")} (${p.avaliacoes})` : "Sem avaliações"} · ${conta[p.whatsapp] || 0} chamada${(conta[p.whatsapp] || 0) === 1 ? "" : "s"} · desde ${p.desde ? fmt(p.desde).slice(0, 5) : "–"}${(p.ids || []).length > 1 ? ` · ${(p.ids || []).length} cadastros` : ""}</p>
            </div>
          </div>
          <div class="acoes">
            <a class="b" href="${base}/#p-${esc(p.id)}" target="_blank" rel="noopener">Ver no site</a>
            <a class="b" href="https://wa.me/${esc(p.whatsapp)}" target="_blank" rel="noopener">${tel(esc(p.whatsapp))}</a>
            <a class="b" href="https://wa.me/${esc(p.whatsapp)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Pedir atualização</a>
            <a class="b" href="https://wa.me/${esc(p.whatsapp)}?text=${encodeURIComponent(`Oi, ${String(p.nome).split(" ")[0]}! Aqui é da Kiiro 💛\n\nPara seu perfil ganhar mais confiança, manda este link para clientes antigos e conhecidos que já viram seu trabalho. Eles deixam uma avaliação em 1 minuto:\n👉 ${base}/i/${p.id}\n\nQuanto mais avaliações, mais gente te chama!`)}" target="_blank" rel="noopener">Pedir avaliações</a>
            ${p.oculto ? form("mostrar", "Mostrar de novo", "zap") : form("ocultar", "Ocultar do site", "")}
          </div>
          ${(() => {
            const nm = String(p.nome).trim(); // empresa ("Borracharia N.S. Aparecida") vai com o nome todo
            const n1 = nm.length <= 26 && /\b(borracharia|loja|oficina|auto|comércio|comercio|serviços|servicos|ltda|me|mei|cia)\b/i.test(nm) ? nm : nm.split(" ")[0];
            const pedidos = doacoesPedidas[p.whatsapp] || [];
            const ultimo = pedidos.length ? pedidos[pedidos.length - 1] : "";
            const texto = `Oi, ${n1}! Aqui é da Kiiro 💛\n\nQue bom que a Kiiro te ajudou a fechar serviço! A Kiiro é grátis para os profissionais e se mantém com doações.\n\nSe puder, apoie com qualquer valor pelo Pix, leva 1 minuto:\n👉 ${base}/d/${p.id}\n\nMuito obrigado pela parceria! 🙏`;
            return `<details class="editar doacao"><summary class="b">💛 Pedir doação${ultimo ? ` <small style="font-weight:500">· último ${fmt(ultimo).slice(0, 5)}${pedidos.length > 1 ? ` (${pedidos.length}x)` : ""}</small>` : ""}</summary>
              <form class="ed" method="post" action="/painel" target="_blank">
                <input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="doacao_pedir"><input type="hidden" name="w" value="${esc(p.whatsapp)}">
                <label class="ed-l">Mensagem (dá para mudar antes de mandar)<textarea name="texto" rows="9">${esc(texto)}</textarea></label>
                <span class="ed-dica">O link ${esc(`${base}/d/${p.id}`)} aparece no WhatsApp com a foto de ${esc(n1)} e o “Apoie a Kiiro”, e abre o Pix de doação no site.</span>
                <button class="b zap" type="submit">Enviar no WhatsApp</button>
              </form></details>`;
          })()}
          <div class="acoes fotos-acoes">
            ${formFoto("foto", "📷 Trocar foto", false)}
            ${formFoto("trabalhos", `🛠️ ${(p.trabalhos || []).length ? "Trocar" : "Adicionar"} fotos de trabalhos`, true)}
            ${p.fotoTrocada ? form("foto_original", "Voltar foto do cadastro", "") : ""}
            ${p.trabalhosTrocados ? form("trabalhos_original", "Voltar trabalhos do cadastro", "") : ""}
          </div>
          <details class="editar"><summary class="b">✏️ Editar dados</summary>${formEditar(p)}</details>
          <div class="acoes">
            ${p.editado ? form("desfazer_edicao", "Desfazer edições (voltar ao cadastro)", "", "Voltar aos dados que a pessoa preencheu no cadastro?") : ""}
            ${form("excluir", "Excluir", "perigo", `Excluir o cadastro de ${String(p.nome).replace(/['"\\]/g, "")}? Isso apaga do Netlify e não dá para desfazer.`)}
          </div>
        </article>`;
      }).join("") || '<p class="vazio">Nenhum profissional cadastrado ainda.</p>'}
      <p class="obs">Ocultar tira do site na hora e dá para voltar. Excluir apaga o cadastro (e os cadastros antigos com o mesmo WhatsApp). As avaliações ficam guardadas: se a pessoa se cadastrar de novo, elas voltam.</p>
      <script src="/servicos.js"></script>
      <script src="/cidades.js"></script>
      <script>
        (function () {
          // serviços: caixinhas por grupo, como no cadastro (máx. 3)
          const grupos = window.KIIRO_SERVICOS || [];
          const conhecidos = new Set(grupos.flatMap(g => g.itens));
          document.querySelectorAll(".ed-servs").forEach(box => {
            const atual = box.dataset.atual.split("|").filter(Boolean);
            const fora = atual.filter(c => !conhecidos.has(c));
            const todosGrupos = fora.length ? [...grupos, { grupo: "Do cadastro", itens: fora }] : grupos;
            todosGrupos.forEach(g => {
              const sec = document.createElement("div"); sec.className = "ed-grupo";
              const h = document.createElement("span"); h.className = "ed-gt"; h.textContent = g.grupo; sec.appendChild(h);
              const w = document.createElement("div"); w.className = "ed-chips";
              g.itens.forEach(i => {
                const l = document.createElement("label"); const c = document.createElement("input");
                c.type = "checkbox"; c.name = "servico"; c.value = i; c.checked = atual.includes(i);
                l.appendChild(c); l.appendChild(document.createTextNode(" " + i)); w.appendChild(l);
              });
              sec.appendChild(w); box.appendChild(sec);
            });
            const fm = box.closest("form"), conta = fm.querySelector(".ed-conta"), outro = fm.querySelector(".ed-outro");
            const atualiza = () => {
              const n = box.querySelectorAll("input:checked").length + (outro.value.trim() ? 1 : 0);
              conta.textContent = n ? n + " de 3 marcados" : "marque até 3";
              box.querySelectorAll("input:not(:checked)").forEach(i => i.disabled = n >= 3);
            };
            box.addEventListener("change", atualiza); outro.addEventListener("input", atualiza); atualiza();
            fm.querySelector(".ed-busca").addEventListener("input", e => {
              const t = e.target.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
              box.querySelectorAll(".ed-grupo").forEach(sec => {
                let vis = 0;
                sec.querySelectorAll("label").forEach(l => { const ok = !t || l.textContent.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(t); l.style.display = ok ? "" : "none"; if (ok) vis++; });
                sec.style.display = vis ? "" : "none";
              });
            });
          });
          const todas = window.KIIRO_TODAS || "Todo o Litoral Norte";
          const N = s => String(s).normalize("NFC").trim();
          const lista = [todas, ...(window.KIIRO_CIDADES || [])].map(N);
          document.querySelectorAll(".ed-cids").forEach(box => {
            const atual = box.dataset.atual.split(/\s*,\s*/).filter(Boolean).map(N);
            const hidden = box.parentNode.querySelector('input[name=cidade]');
            const extras = atual.filter(c => !lista.includes(c));
            [...lista, ...extras].forEach(c => {
              const l = document.createElement("label"); const i = document.createElement("input");
              i.type = "checkbox"; i.value = c; i.checked = atual.includes(c);
              l.appendChild(i); l.appendChild(document.createTextNode(" " + c)); box.appendChild(l);
            });
            const sync = () => { hidden.value = [...box.querySelectorAll("input:checked")].map(i => i.value).join(", "); };
            box.addEventListener("change", sync);
            // cidade principal + distância: marca sozinho as cidades dentro do raio (a principal vai primeiro)
            const fm = box.closest("form"), sel = fm.querySelector(".ed-base");
            if (sel) {
              const primeira = atual.find(c => c !== N(todas)) || "";
              sel.innerHTML = '<option value="">Escolha</option>' + (window.KIIRO_CIDADES || []).map(c => "<option" + (N(c) === N(sel.dataset.atual || primeira) ? " selected" : "") + ">" + c + "</option>").join("");
              const recalc = () => {
                const base = sel.value, r = fm.querySelector("input[name=raio]:checked");
                if (!base || !r || !window.kiiroKm) return;
                const dentro = new Set([base, ...(window.KIIRO_CIDADES || []).filter(c => { const k = window.kiiroKm(base, c); return k !== null && k <= Number(r.value); })].map(N));
                box.querySelectorAll("input").forEach(i => { i.checked = dentro.has(N(i.value)); });
                const ordem = [N(base), ...[...box.querySelectorAll("input:checked")].map(i => N(i.value)).filter(c => c !== N(base))];
                hidden.value = ordem.join(", ");
              };
              sel.addEventListener("change", recalc);
              fm.querySelectorAll("input[name=raio]").forEach(i => i.addEventListener("change", recalc));
              box.addEventListener("change", () => { const b = N(sel.value); const l = [...box.querySelectorAll("input:checked")].map(i => N(i.value)); hidden.value = (l.includes(b) ? [b, ...l.filter(c => c !== b)] : l).join(", "); });
            }
          });
          document.querySelectorAll("form.ed").forEach(fm => fm.addEventListener("submit", e => {
            if (!fm.querySelector(".ed-servs input:checked") && !fm.querySelector(".ed-outro").value.trim()) { e.preventDefault(); alert("Marque pelo menos um serviço."); return; }
            if (!fm.elements.cidade.value) { e.preventDefault(); alert("Marque pelo menos uma cidade."); }
          }));
        })();
        const f = document.getElementById("filtro");
        // trocar foto: reduz no celular antes de enviar (máx. 1000px) e envia sozinho ao escolher
        async function reduzir(arq) {
          const url = URL.createObjectURL(arq);
          try {
            const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
            const e = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * e); c.height = Math.round(img.naturalHeight * e);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            return await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.85));
          } finally { URL.revokeObjectURL(url); }
        }
        document.querySelectorAll(".ffoto input[type=file]").forEach(inp => inp.addEventListener("change", async () => {
          const form = inp.closest("form"); const rot = form.querySelector("label");
          if (!inp.files.length) return;
          rot.firstChild.textContent = "Enviando…";
          const fd = new FormData();
          ["chave", "acao", "w"].forEach(n => fd.append(n, form.elements[n].value));
          fd.append("js", "1");
          for (const arq of [...inp.files].slice(0, 3)) { let b = arq; try { b = (await reduzir(arq)) || arq; } catch {} fd.append("arquivo", b, "foto.jpg"); }
          try {
            const r = await fetch("/painel", { method: "POST", body: fd });
            const d = await r.json();
            location.href = location.pathname + "?" + new URLSearchParams({ chave: fd.get("chave"), aba: "profissionais", aviso: d.aviso || "Pronto." }) + "#" + encodeURIComponent(fd.get("w"));
          } catch { rot.firstChild.textContent = "Não deu, tente de novo"; }
        }));
        f && f.addEventListener("input", () => { const t = f.value.toLowerCase().trim(); document.querySelectorAll(".pro").forEach(a => a.style.display = !t || a.dataset.busca.includes(t) ? "" : "none"); });
      </script>`;
  }

  if (aba === "anuncios") {
    const admin = getStore("admin");
    const lista = (await admin.get("anuncios", { type: "json" })) || {};
    const recusados = new Set((await admin.get("anunciosRecusados", { type: "json" })) || []);
    let pedidos = [], erro = "";
    try {
      const H = { Authorization: `Bearer ${process.env.NETLIFY_TOKEN}` };
      const SITE = process.env.KIIRO_SITE_ID || context?.site?.id || process.env.SITE_ID;
      const forms = await (await fetch(`${API}/sites/${SITE}/forms`, { headers: H })).json();
      const form = Array.isArray(forms) && forms.find((x) => x.name === "anuncio");
      if (form) pedidos = await (await fetch(`${API}/forms/${form.id}/submissions?per_page=100`, { headers: H })).json();
      if (!Array.isArray(pedidos)) pedidos = [];
    } catch { erro = "Não deu para buscar os pedidos no Netlify."; }
    const hoje = diaSP(Date.now());
    const mais = (m) => { const d = new Date(); d.setMonth(d.getMonth() + (+m || 1)); return diaSP(d); };
    const NOMES = { servico_cidade: "Serviço na cidade", cidade: "Cidade inteira", servico: "Serviço no litoral", inicio: "Página inicial", temporada: "Pacote Temporada" };
    const urlArq = (x) => (x && (x.url || (typeof x === "string" ? x : ""))) || "";
    const novos = pedidos.filter((p) => !lista[p.id] && !recusados.has(p.id));
    const fm = (acao, id, rot, cls = "", extra = "", conf = "") => `<form method="post" action="/painel"${conf ? ` onsubmit="return confirm('${conf}')"` : ""}><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="id" value="${esc(id)}">${extra}<button class="b ${cls}" type="submit">${rot}</button></form>`;
    const aviso = url.searchParams.get("aviso");
    const faturasA = await lerFaturas();
    const STP = { pendente: ["pend", "Pix não informado"], informado: ["pend", "💰 Disse que pagou: confira"], pago: ["bom", "Pago ✓"], cortesia: ["bom", "Cortesia 💛"], cancelada: ["ruim", "Fatura cancelada"] };
    const selo = (ft) => ft ? `<span class="st ${STP[ft.status][0]}">${STP[ft.status][1]}</span>` : "";
    const cardPedido = (p) => {
      const d = p.data || {};
      const ftP = d.codigo && faturasA[d.codigo];
      const w = String(d.contato || "").replace(/\D/g, "");
      const zap = `https://wa.me/${w.length === 10 || w.length === 11 ? "55" + w : w}?text=${encodeURIComponent(`Olá! Aqui é da Kiiro 💛 Recebemos o pedido de anúncio da ${d.empresa || ""}. Vamos combinar o pagamento para colocar no ar?`)}`;
      return `<article>
        <div class="an-prev"><div class="an-img" style="background-color:${esc(d.cor || "#fff")};background-image:url('${esc(urlArq(d.banner))}')"></div><div class="an-bt"><span>${esc(d.botao || "Saber mais")}</span></div></div>
        <div class="l1" style="margin-top:10px"><b>${esc(d.empresa)}</b><span>${fmt(p.created_at)}</span></div>
        ${ftP ? `<p style="margin:6px 0">${selo(ftP)} <span class="mini">${reais(ftP.valor)} · fatura ${esc(ftP.id)} · <a href="${q({ aba: "pagamentos" })}">ver pagamentos</a></span></p>` : ""}
        <p><b>${esc(NOMES[d.formato] || d.formato)}</b>${d.cidade && /cidade/.test(d.formato) ? " · " + esc(d.cidade) : ""}${d.grupo && d.formato !== "cidade" && d.formato !== "inicio" ? " · " + esc(d.grupo) : ""} · ${esc(d.meses || 1)} mês(es)<br>Botão “${esc(d.botao || "")}”: ${esc({ whatsapp: "abre o WhatsApp", localizacao: "mostra a localização", site: "abre o site" }[d.acao] || d.acao)} → ${esc(d.destino)}${d.texto ? `<br>“${esc(d.texto)}”` : ""}${d.endereco || d.local ? `<br>📍 ${esc(d.endereco || d.local)}` : ""}</p>
        <div class="acoes">
          <a class="b zap" href="${zap}" target="_blank" rel="noopener">Combinar no WhatsApp</a>
          ${fm("an_aprovar", p.id, "✅ Aprovar e pôr no ar", "", `<label class="mini" style="display:inline-flex;gap:6px;align-items:center;margin-right:6px">até <input type="date" name="ate" value="${mais(d.meses)}" style="font:13px Poppins;border:1px solid #E1D5AE;border-radius:8px;padding:5px"></label>`)}
          ${fm("an_recusar", p.id, "Recusar", "perigo", "", "Recusar este pedido?")}
        </div>
      </article>`;
    };
    const ativos = Object.values(lista).filter((a) => !String(a.id).endsWith("-g"));
    const cardAtivo = (a) => {
      const venceu = a.ate && a.ate < hoje;
      const st = a.pausado ? `<span class="st pend">Pausado</span>` : venceu ? `<span class="st ruim">Venceu em ${esc(a.ate.split("-").reverse().join("/"))}</span>` : `<span class="st bom">No ar${a.ate ? " até " + esc(a.ate.split("-").reverse().join("/")) : ""}</span>`;
      return `<article id="an-${esc(a.id)}">
        <div class="an-prev"><div class="an-img" style="background-color:${esc(a.cor || "#fff")};background-image:url('${esc(a.banner)}')"></div><div class="an-bt"><span>${esc(a.botao)}</span></div></div>
        <div class="l1" style="margin-top:10px"><b>${esc(a.nome)}</b>${st}</div>
        <p>${esc(NOMES[a.formato] || "")}${a.alvoCidade ? " · " + esc(a.alvoCidade) : ""}${a.categoria && a.categoria !== "Todos" ? " · " + esc(a.categoria) : ""}</p>
        <p class="mini" style="margin:0 0 6px">${a.local ? `📍 No mapa: ${esc(a.endereco || a.local.join(", "))} · <a href="https://www.google.com/maps?q=${a.local.join(",")}" target="_blank" rel="noopener">conferir</a>` : "📍 Ainda não aparece no mapa"}</p>
        <details class="editar"><summary class="b">📍 Lugar no mapa</summary>${fm("an_local", a.id, "Salvar lugar", "zap", `<input name="endereco" value="${esc(a.endereco || "")}" placeholder="Endereço ou link do Google Maps" style="font:13px Poppins;border:1px solid #E1D5AE;border-radius:8px;padding:7px;width:100%;margin:8px 0">`)}</details>
        <div class="acoes">
          ${a.pausado ? fm("an_retomar", a.id, "Pôr no ar de novo", "zap") : fm("an_pausar", a.id, "Pausar")}
          ${fm("an_prazo", a.id, "Mudar prazo", "", `<input type="date" name="ate" value="${esc(a.ate || mais(1))}" style="font:13px Poppins;border:1px solid #E1D5AE;border-radius:8px;padding:5px;margin-right:6px">`)}
          <a class="b" href="${q({ aba: "pagamentos", an: a.id })}">💰 Faturas</a>
          ${a.contato ? `<a class="b" href="https://wa.me/${esc(String(a.contato).replace(/\D/g, "").replace(/^(\d{10,11})$/, "55$1"))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          ${fm("an_remover", a.id, "Remover", "perigo", "", "Tirar este anúncio do site?")}
        </div>
      </article>`;
    };
    html = `${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ""}${erro ? `<p class="aviso ruim">${esc(erro)}</p>` : ""}
      <section class="cx"><h3>Novos pedidos <small>${novos.length}</small></h3><p class="obs">Confira o pagamento (selo de cada pedido ou aba Pagamentos) e só depois aprove. Ao aprovar, o anúncio entra no site em até 1 minuto e sai sozinho na data final.</p></section>
      ${novos.map(cardPedido).join("") || '<p class="vazio">Nenhum pedido novo.</p>'}
      <section class="cx"><h3>Anúncios aprovados <small>${ativos.length}</small></h3><p class="obs">Os anúncios que você coloca à mão em patrocinios.js (como o da borracharia) não aparecem aqui.</p></section>
      ${ativos.map(cardAtivo).join("") || '<p class="vazio">Nenhum anúncio aprovado ainda.</p>'}
      <p class="obs">Link para mandar às empresas: <b>${esc(base)}/anunciar</b></p>`;
  }

  if (aba === "pagamentos") {
    const faturas = await lerFaturas();
    const lista = (await getStore("admin").get("anuncios", { type: "json" })) || {};
    const hoje = diaSP(Date.now());
    const mesAtual = hoje.slice(0, 7);
    const todas = Object.values(faturas).sort((a, b) => String(b.criada).localeCompare(String(a.criada)));
    const so = url.searchParams.get("ver") || "abertas";
    const anF = url.searchParams.get("an") || "";
    const doAnuncio = (ft) => !anF || ft.anuncio === anF || ft.pedido === anF;
    const vencida = (ft) => ft.status === "pendente" && ft.vence && ft.vence < hoje;
    const soma = (l) => l.reduce((t, x) => t + (+x.valor || 0), 0);
    const pagasMes = todas.filter((x) => x.status === "pago" && diaSP(x.pagoEm || x.criada).slice(0, 7) === mesAtual);
    const aConf = todas.filter((x) => x.status === "informado");
    const abertas = todas.filter((x) => x.status === "pendente");
    const venc = abertas.filter(vencida);
    const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const nomeMes = (ym) => `${MES[+ym.slice(5, 7) - 1]}/${ym.slice(2, 4)}`;
    const cortesias = todas.filter((x) => x.status === "cortesia");
    const filtros = { abertas: (x) => x.status === "informado" || x.status === "pendente", confirmar: (x) => x.status === "informado", pagas: (x) => x.status === "pago", cortesias: (x) => x.status === "cortesia", todas: (x) => x.status !== "cancelada" };
    const vis = todas.filter((x) => (filtros[so] || filtros.abertas)(x) && doAnuncio(x));
    const sub = (k, rot, n) => `<a class="aba mini ${so === k ? "on" : ""}" href="${q({ aba: "pagamentos", ver: k, ...(anF ? { an: anF } : {}) })}">${rot}${n !== undefined ? ` <small>${n}</small>` : ""}</a>`;
    const voltaE = `<input type="hidden" name="volta" value="${esc(url.searchParams.get("e") || "")}">`;
    const fm = (acao, id, rot, cls = "", conf = "") => `<form method="post" action="/painel"${conf ? ` onsubmit="return confirm('${conf}')"` : ""}><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="id" value="${esc(id)}">${voltaE}<button class="b ${cls}" type="submit">${rot}</button></form>`;
    const zapCobrar = (ft) => {
      let w = String(ft.contato || "").replace(/\D/g, ""); if (w.length === 10 || w.length === 11) w = "55" + w;
      const msg = `Olá! Aqui é da Kiiro 💛 Segue a fatura do anúncio da ${ft.empresa}: ${ft.descricao}${ft.periodo ? ` (${ft.periodo})` : ""}, no valor de ${reais(ft.valor)}${ft.vence ? `, vence em ${brF(ft.vence)}` : ""}.\n\nPara pagar é só abrir o link, tem o QR Code do Pix:\n${base}/pagar?f=${ft.id}\n\nDepois toque em "Já paguei". Obrigado pela parceria! 🙌`;
      return w ? `https://wa.me/${w}?text=${encodeURIComponent(msg)}` : "";
    };
    const ST = { pendente: (ft) => vencida(ft) ? ["ruim", `Vencida em ${brF(ft.vence)}`] : ["pend", `Em aberto${ft.vence ? " · vence " + brF(ft.vence) : ""}`], informado: () => ["pend", "💰 Disse que pagou"], pago: (ft) => ["bom", `Pago em ${brF(diaSP(ft.pagoEm || ft.criada))}`], cortesia: () => ["bom", "Cortesia 💛 · não entra no recebido"], cancelada: () => ["ruim", "Cancelada"] };
    const card = (ft) => {
      const [c, t] = ST[ft.status](ft);
      const z = zapCobrar(ft);
      return `<article>
        <div class="l1"><b>${esc(ft.empresa)}</b><b>${reais(ft.valor)}</b></div>
        <p>${esc(ft.descricao || "")}${ft.periodo ? `<br><span class="mini">Período: ${esc(ft.periodo)}</span>` : ""}<br><span class="st ${c}">${esc(t)}</span> <span class="mini">· fatura ${esc(ft.id)} · ${ft.tipo === "renovacao" ? "renovação" : ft.tipo === "avulsa" ? "lançado por você" : "1º pagamento"}${ft.anuncio || ft.tipo === "avulsa" ? "" : " · anúncio ainda não aprovado"}</span></p>
        <div class="acoes">
          ${ft.status === "informado" ? fm("pg_confirmar", ft.id, "✅ Confirmar recebido", "zap") + fm("pg_reabrir", ft.id, "Não recebi") : ""}
          ${ft.status === "pendente" ? (z ? `<a class="b zap" href="${z}" target="_blank" rel="noopener">Cobrar no WhatsApp</a>` : "") + fm("pg_confirmar", ft.id, "✅ Marcar como pago", "", "Marcar como pago? Use quando a empresa pagou por fora (Pix, dinheiro…).") : ""}
          ${ft.status === "pendente" || ft.status === "informado" ? fm("pg_cortesia", ft.id, "🎁 Cortesia", "", "Marcar como cortesia? Não entra no valor recebido.") : ""}
          ${ft.status === "pago" || ft.status === "cortesia" ? fm("pg_reabrir", ft.id, "Desfazer") : ""}
          <a class="b" href="${base}/pagar?f=${esc(ft.id)}" target="_blank" rel="noopener">Ver página do Pix</a>
          ${!["pago", "cortesia", "cancelada"].includes(ft.status) ? fm("pg_cancelar", ft.id, "Cancelar", "perigo", "Cancelar esta fatura?") : ""}
        </div>
      </article>`;
    };
    // relatório: recebido por mês (últimos 6)
    const meses = []; { let ym = mesAtual; for (let i = 0; i < 6; i++) { meses.push(ym); const [a, m] = ym.split("-").map(Number); ym = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; } }
    const porMes = meses.map((ym) => { const l = todas.filter((x) => x.status === "pago" && diaSP(x.pagoEm || x.criada).slice(0, 7) === ym); return `<tr><td>${nomeMes(ym)}</td><td>${l.length}</td><td style="text-align:right"><b>${reais(soma(l))}</b></td></tr>`; }).join("");
    const ativos = Object.values(lista).filter((a) => a && !String(a.id).endsWith("-g"));
    const aviso = url.searchParams.get("aviso");
    // um "patrocinador" = um anúncio do painel, ou o nome da empresa nos lançamentos avulsos
    const slug = (t) => "e-" + String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const chaveDe = (ft) => ft.anuncio && lista[ft.anuncio] ? ft.anuncio : slug(ft.empresa);
    const grupos = {};
    for (const a of ativos) grupos[a.id] = { k: a.id, nome: a.nome, an: a, fts: [] };
    for (const ft of todas) { if (ft.status === "cancelada") continue; const k = chaveDe(ft); (grupos[k] ||= { k, nome: ft.empresa, an: null, fts: [] }).fts.push(ft); }
    const situacao = (g) => {
      const fts = g.fts;
      if (fts.some(vencida)) return ["ruim", "Vencida", 0];
      if (fts.some((x) => x.status === "informado")) return ["pend", "A confirmar", 1];
      if (fts.some((x) => x.status === "pendente")) return ["pend", "Em aberto", 2];
      const ok = fts.filter((x) => x.status === "pago" || x.status === "cortesia");
      if (!ok.length) return ["pend", "Sem fatura", 3];
      const ult = ok.sort((a, b) => String(b.fim || b.pagoEm).localeCompare(String(a.fim || a.pagoEm)))[0];
      return ult.status === "cortesia" ? ["bom", "Cortesia", 5] : ["bom", "Em dia", 4];
    };
    const pagoAte = (g) => { const ok = g.fts.filter((x) => (x.status === "pago" || x.status === "cortesia") && x.fim).map((x) => x.fim).sort(); return ok.length ? ok[ok.length - 1] : ""; };
    const emAberto = (g) => soma(g.fts.filter((x) => x.status === "pendente" || x.status === "informado"));
    const lancados = (rot) => `<a class="b" href="${q({ aba: "pagamentos" })}">${rot}</a>`;
    const eSel = url.searchParams.get("e") || "";
    const fmAvulsa = (g) => `<form method="post" action="/painel" class="ed">
          <input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="pg_avulsa">${voltaE}${g && g.an ? `<input type="hidden" name="anuncio" value="${esc(g.an.id)}">` : ""}
          <label class="ed-l">Empresa<input name="empresa" value="${esc(g ? g.nome : "")}" placeholder="Ex.: Borracharia N.S. Aparecida" required></label>
          <label class="ed-l">O que é<input name="descricao" placeholder="Ex.: Transporte e mudança · todo o litoral"></label>
          <div class="ed-g"><label class="ed-l">Situação<select name="situacao"><option value="pago">Pago (recebi por fora)</option><option value="cortesia">Cortesia (grátis)</option><option value="pendente">Em aberto (vou cobrar)</option></select></label>
          <label class="ed-l">Valor (R$)<input name="valor" inputmode="decimal" placeholder="Ex.: 15"></label></div>
          <div class="ed-g"><label class="ed-l">Início<input type="date" name="inicio" value="${g && pagoAte(g) && pagoAte(g) >= hoje ? somaDias(pagoAte(g), 1) : hoje}"></label>
          <label class="ed-l">Meses<select name="meses"><option>1</option><option>2</option><option>3</option><option>6</option><option>12</option></select></label></div>
          <label class="ed-l">WhatsApp da empresa (opcional)<input name="contato" inputmode="tel" value="${esc((g && g.an && g.an.contato) || "")}" placeholder="(51) 99999-9999"></label>
          <button class="b zap" type="submit">Lançar</button>
          <span class="ed-dica">Pago por fora, cortesia (não entra no recebido) ou uma cobrança em aberto.</span>
        </form>`;

    if (eSel && grupos[eSel]) {
      // ----- detalhe de um patrocinador
      const g = grupos[eSel];
      const [c, t] = situacao(g);
      const an = g.an;
      const wpp = String((an && an.contato) || (g.fts.find((x) => x.contato) || {}).contato || "").replace(/\D/g, "").replace(/^(\d{10,11})$/, "55$1");
      html = `${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ""}
        <p style="margin:0 0 10px">${lancados("‹ Todos os patrocinadores")}</p>
        <section class="cx"><div class="l1"><h3 style="margin:0">${esc(g.nome)}</h3><span class="st ${c}">${esc(t)}</span></div>
          <div class="kpis"><div><b>${pagoAte(g) ? brF(pagoAte(g)) : "—"}</b><span>Pago até</span></div><div><b>${reais(emAberto(g))}</b><span>Em aberto</span></div><div><b>${reais(soma(g.fts.filter((x) => x.status === "pago")))}</b><span>Já pagou no total</span></div></div>
          ${an ? `<p class="mini" style="margin-top:8px">${esc(NOMES_F[an.formato] || "")}${an.alvoCidade ? " · " + esc(an.alvoCidade) : ""}${an.categoria && an.categoria !== "Todos" ? " · " + esc(an.categoria) : ""} · ${an.pausado ? "pausado" : an.ate ? "no ar até " + brF(an.ate) : "no ar"}</p>` : `<p class="mini" style="margin-top:8px">Patrocinador lançado à mão (fora do formulário do site).</p>`}
          <div class="acoes">${an ? `<a class="b" href="${q({ aba: "anuncios" })}#an-${esc(an.id)}">✏️ Editar anúncio</a>` : ""}${wpp ? `<a class="b" href="https://wa.me/${esc(wpp)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</div>
        </section>
        <h3 style="margin:16px 4px 8px;font-size:15px">Faturas</h3>
        ${g.fts.map(card).join("") || '<p class="vazio">Nenhuma fatura ainda.</p>'}
        ${an ? `<section class="cx"><h3>Cobrar renovação</h3><form method="post" action="/painel" class="ed">
          <input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="pg_nova"><input type="hidden" name="anuncio" value="${esc(an.id)}">${voltaE}
          <div class="ed-g"><label class="ed-l">Meses<select name="meses"><option>1</option><option>2</option><option>3</option><option>6</option><option>12</option></select></label>
          <label class="ed-l">Valor (vazio = tabela)<input name="valor" inputmode="decimal" placeholder="Ex.: 15"></label></div>
          <button class="b zap" type="submit">Criar fatura</button></form></section>` : ""}
        <details class="cx"><summary style="cursor:pointer;font-weight:600">Lançar pagamento ou cortesia</summary>${fmAvulsa(g)}</details>`;
    } else {
      // ----- resumo: uma linha por patrocinador
      const linhas = Object.values(grupos).map((g) => ({ g, s: situacao(g) })).sort((a, b) => a.s[2] - b.s[2] || a.g.nome.localeCompare(b.g.nome, "pt-BR"));
      html = `${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ""}
      <section class="cx"><h3>Pagamentos</h3>
        <div class="kpis">
          <div><b>${reais(soma(pagasMes))}</b><span>Recebido em ${nomeMes(mesAtual)}</span></div>
          <div><b>${aConf.length}</b><span>A confirmar</span></div>
          <div><b>${reais(soma(abertas))}</b><span>Em aberto (${abertas.length})</span></div>
          <div><b style="color:${venc.length ? "#B3261E" : "inherit"}">${venc.length}</b><span>Vencidas</span></div>
          <div><b>${cortesias.length}</b><span>Cortesias</span></div>
        </div>
      </section>
      <section class="cx planilha"><h3>Patrocinadores <small>${linhas.length}</small></h3>
        ${linhas.length ? `<table><thead><tr><th>Empresa</th><th>Situação</th><th>Pago até</th><th style="text-align:right">Em aberto</th></tr></thead><tbody>
        ${linhas.map(({ g, s: [c, t] }) => `<tr onclick="location.href=this.dataset.href" data-href="${q({ aba: "pagamentos", e: g.k })}"><td><a href="${q({ aba: "pagamentos", e: g.k })}"><b>${esc(g.nome)}</b></a></td><td><span class="st ${c}">${esc(t)}</span></td><td>${pagoAte(g) ? brF(pagoAte(g)).slice(0, 5) + "/" + pagoAte(g).slice(2, 4) : "—"}</td><td style="text-align:right;white-space:nowrap">${emAberto(g) ? reais(emAberto(g)) : "—"}</td></tr>`).join("")}
        </tbody></table><p class="obs">Toque numa empresa para ver as faturas, marcar como pago, dar cortesia, cobrar ou editar o anúncio.</p>` : '<p class="obs">Nenhum patrocinador ainda.</p>'}
      </section>
      <details class="cx"><summary style="cursor:pointer;font-weight:600">＋ Lançar pagamento ou cortesia</summary>${fmAvulsa(null)}</details>
      <details class="cx"><summary style="cursor:pointer;font-weight:600">Recebido por mês</summary><table style="margin-top:8px"><thead><tr><th>Mês</th><th>Faturas</th><th style="text-align:right">Total</th></tr></thead><tbody>${porMes}</tbody></table></details>
      <p class="obs" style="margin:0 4px">Quando a empresa toca em “Já paguei”, chega um aviso no celular e a linha dela fica “A confirmar”. 3 dias antes de um anúncio vencer, a Kiiro cria a fatura de renovação e te avisa com a cobrança pronta.</p>`;
    }
  }

  if (aba === "graficos") {
    const met = getStore("metricas");
    const d30 = diasAtras(29);
    const chavesMet = (await met.list()).blobs.map((b) => b.key).filter((k) => k.slice(0, 10) >= d30);
    const gav = await Promise.all(chavesMet.map(async (k) => ({ dia: k.slice(0, 10), m: (await met.get(k, { type: "json" })) || { n: {} } })));
    const tipo = url.searchParams.get("t") || "visita";
    const TIPOS_G = { visita: "Visitas", perfil: "Perfis abertos", chamar: "Chamadas" };
    const nomeT = TIPOS_G[tipo] || "Visitas";

    // por dia (30 dias)
    const listaDias = Array.from({ length: 30 }, (_, i) => diasAtras(29 - i));
    const chDias = todasChaves.map((k) => dataDaChave(k)).filter(Boolean);
    const porDia = listaDias.map((dia) => tipo === "chamar"
      ? chDias.filter((d) => diaSP(d) === dia).length
      : gav.filter((g) => g.dia === dia).reduce((a, g) => a + (g.m.n[tipo] || 0), 0));
    const rotDia = listaDias.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7));

    // por hora: hoje e 7 dias (os eventos por hora começaram a ser guardados em 03/11/2026)
    const horaSP = (d) => Number(new Date(d).toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).slice(0, 2));
    const porHora = (desde) => Array.from({ length: 24 }, (_, h) => {
      if (tipo === "chamar") return chDias.filter((d) => diaSP(d) >= desde && horaSP(d) === h).length;
      const hh = String(h).padStart(2, "0");
      return gav.filter((g) => g.dia >= desde).reduce((a, g) => a + ((g.m.h && g.m.h[hh] && g.m.h[hh][tipo]) || 0), 0);
    });
    const hHoje = porHora(hoje), h7 = porHora(diasAtras(6));
    const rotHora = Array.from({ length: 24 }, (_, h) => h + "h");
    const horaAgora = horaSP(Date.now());

    // dia da semana (30 dias)
    const SEM = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const porSem = SEM.map((_, w) => listaDias.reduce((a, dia, i) => a + (new Date(dia + "T12:00:00Z").getUTCDay() === w ? porDia[i] : 0), 0));

    const pico = (arr, rot) => { const mx = Math.max(...arr); return mx ? rot[arr.indexOf(mx)] : "–"; };
    const total = (arr) => arr.reduce((a, b) => a + b, 0);
    const temHora = tipo === "chamar" || gav.some((g) => g.m.h);

    // gráfico de barras em SVG (uma série, sem legenda; passar o dedo mostra o valor)
    const barras = (vals, rots, { destaque = -1, cada = 1, alt = 150 } = {}) => {
      const n = vals.length, W = 640, H = alt, top = 18, base = H - 22, mx = Math.max(1, ...vals);
      const passo = W / n, larg = Math.max(4, passo - 2);
      const nice = mx <= 5 ? mx : Math.ceil(mx / 5) * 5;
      const y = (v) => base - (v / nice) * (base - top);
      const grade = [0.5, 1].map((f) => `<line x1="0" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}" class="gl"/><text x="${W}" y="${y(nice * f) - 4}" class="gy" text-anchor="end">${num(Math.round(nice * f))}</text>`).join("");
      const bs = vals.map((v, i) => {
        const x = i * passo + 1, h = Math.max(0, base - y(v)), r = Math.min(4, larg / 2, h);
        const d = h > 0 ? `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + larg - r}Q${x + larg},${base - h} ${x + larg},${base - h + r}V${base}Z` : "";
        return `<g class="gb${i === destaque ? " on" : ""}"><rect x="${i * passo}" y="${top}" width="${passo}" height="${base - top}" class="hit"/>${d ? `<path d="${d}"/>` : `<rect x="${x}" y="${base - 1}" width="${larg}" height="1" class="zero"/>`}<title>${esc(rots[i])}: ${num(v)}</title></g>`;
      }).join("");
      const rx = rots.map((t, i) => (i % cada === 0 || i === n - 1) && !(i === n - 1 && (n - 1) % cada !== 0 && (n - 1) % cada < cada / 2) ? `<text x="${i * passo + passo / 2}" y="${H - 6}" class="gx" text-anchor="middle">${esc(t)}</text>` : "").join("");
      return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img">${grade}<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="gbase"/>${bs}${rx}</svg>`;
    };
    const tabelaDe = (rots, vals) => `<details class="gt"><summary>Ver em tabela</summary><table><tbody>${rots.map((r, i) => `<tr><td>${esc(r)}</td><td>${num(vals[i])}</td></tr>`).join("")}</tbody></table></details>`;
    const sel = (v, t) => `<a class="aba mini ${tipo === v ? "on" : ""}" href="${q({ aba: "graficos", t: v })}">${t}</a>`;

    html = `<nav class="abas sub">${sel("visita", "Visitas")}${sel("perfil", "Perfis abertos")}${sel("chamar", "Chamadas")}</nav>
      <section class="cx"><h3>${nomeT} por dia · 30 dias</h3>
        <div class="kpis"><div><b>${num(total(porDia))}</b><span>no total</span></div><div><b>${num(porDia[29])}</b><span>hoje</span></div><div><b>${esc(pico(porDia, rotDia))}</b><span>melhor dia</span></div></div>
        ${barras(porDia, rotDia, { destaque: 29, cada: 5 })}
        ${tabelaDe(rotDia, porDia)}
      </section>
      <section class="cx"><h3>${nomeT} por hora · hoje</h3>
        ${temHora ? `<div class="kpis"><div><b>${num(total(hHoje))}</b><span>hoje</span></div><div><b>${esc(pico(hHoje, rotHora))}</b><span>hora com mais</span></div></div>
        ${barras(hHoje, rotHora, { destaque: horaAgora, cada: 3 })}<p class="obs">A barra amarela é a hora atual.</p>` : `<p class="vz">A contagem por hora começou agora. Os dados aparecem conforme as pessoas entram.</p>`}
      </section>
      <section class="cx"><h3>${nomeT} por hora · últimos 7 dias somados</h3>
        ${temHora ? `<div class="kpis"><div><b>${esc(pico(h7, rotHora))}</b><span>horário de pico</span></div></div>
        ${barras(h7, rotHora, { destaque: h7.indexOf(Math.max(...h7)), cada: 3 })}
        <p class="obs">Bom para saber a melhor hora de postar no Instagram e nos grupos.</p>${tabelaDe(rotHora, h7)}` : `<p class="vz">Começa a aparecer a partir de hoje.</p>`}
      </section>
      <section class="cx"><h3>${nomeT} por dia da semana · 30 dias</h3>
        <div class="kpis"><div><b>${esc(pico(porSem, SEM))}</b><span>dia com mais</span></div></div>
        ${barras(porSem, SEM, { destaque: porSem.indexOf(Math.max(...porSem)), alt: 130 })}
      </section>
      <p class="obs" style="padding:0 4px">Passe o dedo ou o mouse numa barra para ver o número. ${tipo === "chamar" ? "Chamadas contam desde o início." : "As contagens por hora começaram em 03/11/2026; as por dia, quando o contador foi ligado."}</p>`;
  }

  if (aba === "disparos") {
    const admin = getStore("admin");
    const modelos = await lerModelos(admin);
    const camps = (await admin.get("campanhas", { type: "json" })) || [];
    const aviso = url.searchParams.get("aviso");
    let pros = [];
    try { const r = await fetch(`${base}/.netlify/functions/profissionais?admin=${encodeURIComponent(KEY)}`); pros = await r.json(); if (!Array.isArray(pros)) pros = []; } catch {}
    pros = pros.filter((p) => !p.oculto);
    const cidades = [...new Set(pros.map((p) => p.cidade).filter(Boolean))].sort();
    const servicos = [...new Set(pros.flatMap((p) => p.categorias || [p.categoria]).filter(Boolean))].sort();
    const hid = (n, v) => `<input type="hidden" name="${n}" value="${esc(v)}">`;
    const camp = camps.find((x) => x.id === url.searchParams.get("c"));

    if (camp) {
      // ----- a fila
      const alvo = pros.filter((p) => (!camp.cidade || p.cidade === camp.cidade) && (!camp.servico || (p.categorias || [p.categoria]).includes(camp.servico)));
      const feito = (p) => camp.enviados[p.whatsapp] ? "enviado" : camp.pulados[p.whatsapp] ? "pulado" : "";
      const ordem = [...alvo.filter((p) => !feito(p)), ...alvo.filter((p) => feito(p))];
      const nEnv = alvo.filter((p) => camp.enviados[p.whatsapp]).length;
      html = `${aviso ? `<div class="aviso">${esc(aviso)}</div>` : ""}
        <p><a href="${q({ aba: "disparos" })}">← Disparos</a></p>
        <h2 style="margin:6px 0 2px">${esc(camp.nome)}</h2>
        <p class="mini">${camp.cidade || "Todas as cidades"} · ${camp.servico || "todos os serviços"} · criada ${fmt(camp.criada)}</p>
        <div class="prog"><i style="width:${alvo.length ? (nEnv / alvo.length) * 100 : 0}%"></i></div>
        <p style="margin:6px 0 12px"><b>${nEnv} de ${alvo.length}</b> enviados${alvo.length - nEnv ? ` · faltam ${alvo.length - nEnv}` : " · ✅ todos!"}</p>
        ${ordem.map((p, i) => {
          const txt = preencher(camp.texto, p, base), st = feito(p);
          return `<article class="fila ${st ? "ok" : ""} ${!st && i === 0 ? "prox" : ""}">
            <div class="l1"><b>${esc(p.nome)}</b><span>${st === "enviado" ? `<span class="st bom">✓ enviado ${fmt(camp.enviados[p.whatsapp]).slice(0, 5)}</span>` : st === "pulado" ? `<span class="st pend">pulado</span>` : esc(tel(p.whatsapp))}</span></div>
            <p class="mini">${esc((p.categorias || []).join(" · "))} · ${esc(p.cidade)}</p>
            <details><summary class="mini" style="cursor:pointer">Ver mensagem</summary><blockquote style="white-space:pre-wrap">${esc(txt)}</blockquote></details>
            <div class="acoes">
              ${st ? `<form method="post">${hid("chave", KEY)}${hid("acao", "dp_desfazer")}${hid("c", camp.id)}${hid("w", p.whatsapp)}<button class="b">Desfazer</button></form>`
                : `<form method="post" target="_blank" onsubmit="setTimeout(()=>location.reload(),1500)">${hid("chave", KEY)}${hid("acao", "dp_enviar")}${hid("c", camp.id)}${hid("w", p.whatsapp)}${hid("texto", txt)}<button class="b zap">Enviar no WhatsApp</button></form>
                   <form method="post">${hid("chave", KEY)}${hid("acao", "dp_pular")}${hid("c", camp.id)}${hid("w", p.whatsapp)}<button class="b">Pular</button></form>`}
            </div></article>`;
        }).join("") || `<p class="vazio">Nenhum profissional nesse filtro.</p>`}
        <form method="post" onsubmit="return confirm('Apagar esta fila?')" style="margin-top:14px">${hid("chave", KEY)}${hid("acao", "dp_apagar")}${hid("c", camp.id)}<button class="b perigo">Apagar fila</button></form>`;
    } else {
      // ----- modelos + nova fila + filas anteriores
      const opc = (l, rot) => `<option value="">${rot}</option>` + l.map((x) => `<option>${esc(x)}</option>`).join("");
      const editor = (m) => `<form class="ed" method="post">${hid("chave", KEY)}${hid("acao", "dp_tpl_salvar")}${hid("id", m ? m.id : "")}
          <label class="ed-l">Nome do modelo<input name="nome" value="${esc(m ? m.nome : "")}" placeholder="Ex.: Pedir avaliações"></label>
          <label class="ed-l">Mensagem<textarea name="texto" rows="9" placeholder="Oi, {nome}! ...">${esc(m ? m.texto : "")}</textarea></label>
          <button class="b zap">Salvar modelo</button></form>`;
      html = `${aviso ? `<div class="aviso">${esc(aviso)}</div>` : ""}
        <h2 style="margin-bottom:4px">Nova fila de envio</h2>
        <p class="obs" style="margin:0 0 10px">Escolha o modelo e para quem vai. Depois é só tocar em <b>Enviar</b> em cada profissional: o WhatsApp abre com a mensagem e o link certo de cada um.</p>
        <form class="ed" method="post">${hid("chave", KEY)}${hid("acao", "dp_criar")}
          <label class="ed-l">Modelo<select name="modelo">${modelos.map((m) => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join("")}</select></label>
          <div class="ed-g"><label class="ed-l">Cidade<select name="cidade">${opc(cidades, "Todas")}</select></label>
          <label class="ed-l">Serviço<select name="servico">${opc(servicos, "Todos")}</select></label></div>
          <button class="b zap">Criar fila (${pros.length} profissionais no site)</button></form>

        ${camps.length ? `<h2 style="margin:20px 0 6px">Filas</h2>` + camps.map((c) => {
          const n = Object.keys(c.enviados).length;
          return `<a class="fila-l" href="${q({ aba: "disparos", c: c.id })}"><b>${esc(c.nome)}</b><span>${fmt(c.criada).slice(0, 5)} · ${c.cidade || "todas"} · ${n} enviado${n === 1 ? "" : "s"}</span></a>`;
        }).join("") : ""}

        <h2 style="margin:20px 0 6px">Modelos</h2>
        <p class="obs" style="margin:0 0 8px">Palavras entre chaves viram os dados de cada profissional: <b>{nome}</b> · <b>{link_avaliacao}</b> · <b>{link_doacao}</b> · <b>{link_perfil}</b> · <b>{servico}</b> · <b>{cidade}</b> · <b>{site}</b></p>
        ${modelos.map((m) => `<details class="editar"><summary class="b">✏️ ${esc(m.nome)}</summary>${editor(m)}
          <form method="post" onsubmit="return confirm('Apagar este modelo?')" style="margin-top:6px">${hid("chave", KEY)}${hid("acao", "dp_tpl_apagar")}${hid("id", m.id)}<button class="b perigo">Apagar modelo</button></form></details>`).join("")}
        <details class="editar" style="margin-top:8px"><summary class="b">＋ Novo modelo</summary>${editor(null)}</details>`;
    }
  }

  if (aba === "contas") {
    const contas = (await todasContas()).sort((a, b) => (a.criado < b.criado ? 1 : -1));
    const bt = (login, acao, txt, conf) => `<form method="post" style="display:inline"><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="login" value="${esc(login)}"><button class="b" name="acao" value="${acao}" onclick="return confirm('${conf}')">${txt}</button></form>`;
    const pros = contas.filter((c) => c.whats).length;
    html = `<p class="obs">${contas.length} ${contas.length === 1 ? "conta" : "contas"} · ${pros} ligada${pros === 1 ? "" : "s"} a profissional. Senhas ficam guardadas só como código (ninguém vê). Esqueceu a senha? A pessoa toca em “Esqueci minha senha”, você recebe o aviso 🔑 e manda a senha provisória (ou use o botão abaixo). Ela entra e cria uma nova.</p>` +
      (contas.map((c) => `
        <article>
          <div class="l1"><b>${esc(c.nome)} ${esc(c.sobrenome)}</b><span>${fmt(c.criado)}</span></div>
          <p class="mini">${tel(c.login)} · ${(c.chamadas || []).length} chamados · ${c.convidados || 0} convidados${c.ref ? " · veio por convite" : ""}</p>
          ${c.provisoria && Date.now() < c.provisoria.ate ? `<p><span class="st pend">🔑 Pediu senha nova ${fmt(c.provisoria.pedida)}</span></p>` : ""}
          ${c.whats ? `<p>🔑 Ligada ao profissional <b>${tel(c.whats)}</b>${c.whats === c.tel ? " (mesmo WhatsApp da conta)" : ""}</p>` : ""}
          <div class="acoes">
            ${c.whats ? bt(c.login, "ct_soltar", "Desligar do profissional", "Desligar esta conta do cadastro de profissional?") : ""}
            ${c.tel ? `<a class="b" href="https://wa.me/${esc(c.tel)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
            <form method="post" target="_blank" style="display:inline"><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="login" value="${esc(c.login)}"><button class="b zap" name="acao" value="ct_senha">Mandar senha provisória</button></form>
            ${bt(c.login, "ct_apagar", "Apagar conta", "Apagar esta conta? O histórico de chamadas continua no painel.")}
          </div>
        </article>`).join("") || `<p class="vazio">Ninguém criou conta ainda.</p>`);
  }

  if (aba === "indicacoes") {
    const st = getStore("indicacoes");
    const { blobs } = await st.list();
    const itens = (await Promise.all(blobs.map(async (b) => ({ k: b.key, x: await st.get(b.key, { type: "json" }) })))).filter((i) => i.x).sort((a, b) => (a.x.data < b.x.data ? 1 : -1));
    const pend = itens.filter((i) => i.x.status !== "aprovada").length;
    const ver = filtro === "todas" ? "pendentes" : filtro;
    const lista = itens.filter((i) => (ver === "aprovadas" ? i.x.status === "aprovada" : i.x.status !== "aprovada"));
    const sub = (v, t, n) => `<a class="aba mini ${ver === v ? "on" : ""}" href="${q({ aba: "indicacoes", ver: v })}">${t} <small>${n}</small></a>`;
    const bt = (k, acao, txt, cls = "", conf = "") => `<form method="post" style="display:inline"><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="id" value="${esc(k)}"><button class="b ${cls}" name="acao" value="${acao}"${conf ? ` onclick="return confirm('${conf}')"` : ""}>${txt}</button></form>`;
    html = `<nav class="abas sub">${sub("pendentes", "Para aprovar", pend)}${sub("aprovadas", "No perfil", itens.length - pend)}</nav>` +
      (lista.map(({ k, x }) => `
        <article>
          <div class="l1"><b>Para ${esc(x.profissionalNome)}</b><span>${fmt(x.data)}</span></div>
          <p>${x.nota ? `<b style="color:#B38B00">${"★".repeat(x.nota)}${"☆".repeat(5 - x.nota)}</b> ` : "<small>(indicação antiga, sem nota)</small> "}<b>${esc(x.nome)}</b>${x.relacao ? ` · ${esc(x.relacao)}` : ""}</p>
          ${x.texto ? `<blockquote>“${esc(x.texto)}”</blockquote>` : ""}
          <div class="acoes">
            ${x.status === "aprovada" ? bt(k, "in_ocultar", "Tirar do perfil") : bt(k, "in_aprovar", "Aprovar", "zap")}
            <a class="b" href="https://wa.me/${esc(x.whatsapp)}" target="_blank" rel="noopener">Falar com ${esc(String(x.nome).split(" ")[0])}</a>
            ${bt(k, "in_excluir", "Excluir", "", "Excluir esta avaliação?")}
          </div>
        </article>`).join("") || `<p class="vazio">${ver === "aprovadas" ? "Nenhuma avaliação por link no perfil ainda." : "Nenhuma avaliação por link para aprovar."}</p>`) +
      `<p class="obs">Avaliações que chegam pelo link do profissional (/i/…). Aprovadas, aparecem no perfil e contam na nota. Dica: na aba Profissionais, o botão <b>Pedir avaliações</b> manda o link para o profissional enviar aos clientes antigos.</p>`;
  }

  if (aba === "pedidos") {
    const store = getStore("pedidos");
    const { blobs } = await store.list();
    const itens = (await Promise.all(blobs.map((b) => b.key).sort().reverse().slice(0, 300).map(async (k) => ({ k, p: await store.get(k, { type: "json" }) })))).filter((i) => i.p);
    const abertos = itens.filter((i) => i.p.status !== "atendido").length;
    const lista = itens.filter((i) => (filtro === "abertos" ? i.p.status !== "atendido" : filtro === "atendidos" ? i.p.status === "atendido" : true));
    const sub = (v, t, n) => `<a class="aba mini ${filtro === v ? "on" : ""}" href="${q({ aba: "pedidos", ver: v })}">${t} <small>${n}</small></a>`;
    const bt = (k, acao, txt, conf) => `<form method="post" style="display:inline"><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="id" value="${esc(k)}"><button class="b" name="acao" value="${acao}"${conf ? ` onclick="return confirm('${conf}')"` : ""}>${txt}</button></form>`;
    html = `<nav class="abas sub">${sub("todas", "Todos", itens.length)}${sub("abertos", "Abertos", abertos)}${sub("atendidos", "Atendidos", itens.length - abertos)}</nav>` +
      (lista.map(({ k, p }) => {
        const primeiro = String(p.nome).split(" ")[0];
        const texto = `Oi, ${primeiro}! Aqui é da Kiiro 💛\n\nRecebi seu pedido de ${String(p.servico).toLowerCase()}${p.cidade ? " em " + p.cidade : ""}. Já estou procurando um profissional para você e te aviso por aqui.`;
        const indicar = `Oi! Aqui é da Kiiro 💛 Tenho um cliente precisando de ${String(p.servico).toLowerCase()}${p.cidade ? " em " + p.cidade : ""}: "${p.descricao}" (${p.quando || "sem data"}). Tem interesse? O contato é ${p.nome}: https://wa.me/${p.whatsapp}`;
        return `
        <article>
          <div class="l1"><b>${esc(p.servico)}${p.cidade ? " · " + esc(p.cidade) : ""}</b><span>${fmt(p.data)}</span></div>
          <p><b>${esc(p.nome)}</b> · ${esc(p.quando || "sem data")}</p>
          <blockquote>“${esc(p.descricao)}”</blockquote>
          ${p.status === "atendido" ? `<span class="st bom">Atendido</span>` : `<span class="st pend">Aberto</span>`}
          <div class="acoes">
            <a class="b zap" href="https://wa.me/${esc(p.whatsapp)}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Responder cliente</a>
            <a class="b" href="https://wa.me/?text=${encodeURIComponent(indicar)}" target="_blank" rel="noopener">Mandar a um profissional</a>
            ${p.status === "atendido" ? bt(k, "pd_novo", "Reabrir") : bt(k, "pd_atendido", "Marcar atendido")}
            ${bt(k, "pd_excluir", "Excluir", "Excluir este pedido?")}
          </div>
        </article>`;
      }).join("") || '<p class="vazio">Nenhum pedido ainda. Eles aparecem aqui quando alguém pede orçamento num serviço sem profissional.</p>');
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
        const msg = `Oi, ${primeiro}! Tudo bem? Aqui é da Kiiro 💛\n\nVocê chamou ${profPrimeiro} pela Kiiro. Como foi o atendimento?\n\nSua avaliação leva 10 segundos e ajuda muito quem vem depois a escolher bem:\n👉 ${link}\n\nObrigado! 🙌`;
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

  if (aba === "lembretes") {
    const aviso = url.searchParams.get("aviso");
    const lista = await lerLembretes();
    const hj = hojeLb();
    const dias = (d) => Math.round((new Date(d + "T12:00:00Z") - new Date(hj + "T12:00:00Z")) / 864e5);
    const quando = (d) => { const n = dias(d); return n < 0 ? `atrasado ${-n} ${n === -1 ? "dia" : "dias"}` : n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`; };
    const brD = (d) => String(d).split("-").reverse().join("/");
    const fm = (acao, id, rot, cls = "", conf = "") => `<form method="post" action="/painel" style="display:inline"${conf ? ` onsubmit="return confirm('${conf}')"` : ""}><input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="id" value="${esc(id)}"><button class="b ${cls}" type="submit">${rot}</button></form>`;
    // vencimentos de anúncios aprovados entram na lista automaticamente
    let anuncios = [];
    try { anuncios = Object.values((await getStore("admin").get("anuncios", { type: "json" })) || {}).filter((a) => a && a.ate && !String(a.id).endsWith("-g") && !a.pausado); } catch {}
    const itens = [
      ...lista.map((l) => ({ ...l, tipo: "meu" })),
      ...anuncios.map((a) => ({ id: "an-" + a.id, titulo: `Anúncio de ${a.nome} vence`, data: a.ate, nota: "Combine a renovação e o Pix com a empresa. O aviso de renovação já chega no celular 3 dias antes.", tipo: "anuncio" })),
    ].sort((a, b) => (a.feito ? 1 : 0) - (b.feito ? 1 : 0) || String(a.data).localeCompare(String(b.data)));
    const card = (l) => {
      const n = dias(l.data);
      const st = l.feito ? `<span class="st bom">Feito ✓</span>` : n < 0 ? `<span class="st ruim">${quando(l.data)}</span>` : n <= 7 ? `<span class="st pend">${quando(l.data)}</span>` : `<span class="st" style="background:#F3ECD4">${quando(l.data)}</span>`;
      return `<article${l.feito ? ' style="opacity:.6"' : ""}>
        <div class="l1"><b>${esc(l.titulo)}</b>${st}</div>
        <p class="mini" style="margin:2px 0 0">📅 ${brD(l.data)}${l.tipo === "anuncio" ? " · da aba Anúncios" : ""}</p>
        ${l.nota ? `<p>${esc(l.nota)}</p>` : ""}
        <div class="acoes">
          ${l.link ? `<a class="b" href="${esc(l.link)}" target="_blank" rel="noopener">Abrir link</a>` : ""}
          ${l.tipo === "meu" ? (l.feito ? fm("lb_reabrir", l.id, "Reabrir") : fm("lb_feito", l.id, "Marcar como feito", "zap")) + fm("lb_apagar", l.id, "Apagar", "perigo", "Apagar este lembrete?") : `<a class="b" href="${q({ aba: "anuncios" })}">Ver anúncio</a>`}
        </div>
      </article>`;
    };
    html = `${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ""}
      <section class="cx"><h3>Novo lembrete</h3>
        <form class="ed" method="post" action="/painel">
          <input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="lb_criar">
          <label class="ed-l">O que lembrar<input name="titulo" maxlength="80" required placeholder="Ex.: Renovar o domínio"></label>
          <label class="ed-l">Data<input name="data" type="date" required min="${hj}"></label>
          <label class="ed-l">Detalhes <span class="ed-dica">Opcional</span><textarea name="nota" maxlength="300" rows="2"></textarea></label>
          <label class="ed-l">Link <span class="ed-dica">Opcional. Abre ao tocar no aviso.</span><input name="link" maxlength="300" placeholder="https://"></label>
          <button class="b zap" type="submit">Criar lembrete</button>
        </form>
        <p class="obs">Você recebe no celular (app ntfy) um aviso <b>um dia antes</b> e outro <b>no dia</b>, sempre às 9h.</p>
      </section>
      ${itens.map(card).join("") || '<p class="vazio">Nenhum lembrete.</p>'}`;
  }

  if (aba === "avisos") {
    const aviso = url.searchParams.get("aviso");
    let l = [];
    try { l = await inscricoes(); } catch {}
    const pros = l.filter((x) => x.tipo === "pro"), clis = l.filter((x) => x.tipo === "cliente");
    html = `${aviso ? `<p class="aviso">${esc(aviso)}</p>` : ""}
      <section class="cx"><h3>Quem recebe avisos no celular</h3>
        <div class="kpis"><div><b>${num(pros.length)}</b><span>profissionais</span></div><div><b>${num(clis.length)}</b><span>clientes</span></div></div>
        <p class="obs">Avisos automáticos: o profissional recebe quando um cliente chama e quando recebe avaliação; o cliente recebe o lembrete para avaliar no dia seguinte. Para ativar, mande o link <b>${esc(base)}/avisos</b>.</p>
      </section>
      <section class="cx"><h3>Mandar um aviso agora</h3>
        <form class="ed" method="post" action="/painel" onsubmit="return confirm('Mandar este aviso agora?')">
          <input type="hidden" name="chave" value="${esc(KEY)}"><input type="hidden" name="acao" value="push_enviar">
          <label class="ed-l">Para quem<select name="para"><option value="pro">Profissionais (${pros.length})</option><option value="cliente">Clientes (${clis.length})</option><option value="">Todo mundo (${l.length})</option></select></label>
          <label class="ed-l">Título<input name="titulo" maxlength="60" required placeholder="Ex.: Começou a temporada! ☀️"></label>
          <label class="ed-l">Texto<textarea name="texto" maxlength="180" rows="3" required placeholder="Ex.: Atualize sua agenda na Kiiro para receber mais clientes no verão."></textarea></label>
          <label class="ed-l">Abrir ao tocar <span class="ed-dica">Opcional. Ex.: /cadastro ou um link completo. Vazio abre a Kiiro.</span><input name="link" maxlength="300" placeholder="/"></label>
          <button class="b zap" type="submit">Enviar aviso</button>
        </form>
        <p class="obs">Use com moderação: aviso demais faz as pessoas desligarem.</p>
      </section>`;
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
.graf{width:100%;height:auto;display:block;margin-top:6px;overflow:visible}
.graf .gb path,.graf .gb .zero{fill:#3A3630}
.graf .gb.on path{fill:#FFC800}
.graf .gb .hit{fill:transparent}
.graf .gb:hover path{fill:#6B6458}.graf .gb.on:hover path{fill:#E6B400}
.graf .gl{stroke:#EFE6C8;stroke-width:1;stroke-dasharray:3 4}
.graf .gbase{stroke:#D8CDA8;stroke-width:1}
.graf .gx,.graf .gy{font:500 11px Poppins,sans-serif;fill:#8A8271}
.kpis{display:flex;gap:18px;margin:4px 0 2px;flex-wrap:wrap}
.kpis div{display:flex;flex-direction:column}.kpis b{font-size:20px;line-height:1.2}.kpis span{font-size:11.5px;color:#8A8271}
.gt{margin-top:8px;font-size:13px}.gt summary{cursor:pointer;color:#5E574A}.gt table{margin-top:6px}
.st{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:3px 10px}
.pend{background:#FFF3C4}.bom{background:#DDF3E4;color:#0E5C2C}.ruim{background:#FFE4DE;color:#8A1C0E}
blockquote{margin-top:8px;font-size:14px;color:#5E574A;border-left:3px solid #FFC800;padding-left:10px}
.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.acoes form{display:inline}
.b{display:inline-block;border:1px solid #1A1A1A;background:#fff;border-radius:10px;padding:7px 12px;font:600 13px Poppins,sans-serif;text-decoration:none;color:#1A1A1A;cursor:pointer}
.b.zap{background:#FFC800;border-color:#FFC800}
.b.perigo{border-color:#B3261E;color:#B3261E}
.vazio{text-align:center;color:#5E574A;padding:40px 0}
.mini{font-size:12px;color:#6B6455}
.planilha table td,.planilha table th{padding:9px 6px;border-bottom:1px solid #F3ECD4;font-size:13.5px;text-align:left;vertical-align:middle}
.planilha tbody tr{cursor:pointer}.planilha tbody tr:hover{background:#FFFAEA}
.planilha a{color:#1A1A1A;text-decoration:none}
.planilha .st{font-size:11.5px;padding:2px 8px;white-space:nowrap}
details.cx summary{list-style:none}details.cx summary::-webkit-details-marker{display:none}
.foto{display:flex;gap:10px;align-items:flex-end;margin-top:10px}.foto img{width:96px;height:96px;object-fit:cover;border-radius:12px}
.prog{height:10px;border-radius:6px;background:#F3ECD4;overflow:hidden;margin-top:10px}.prog i{display:block;height:100%;background:#1AAD5B}
article.fila.ok{opacity:.6}article.fila.prox{border:2px solid #FFC800}
.fila-l{display:flex;justify-content:space-between;gap:10px;background:#fff;border:1px solid #EFE6C8;border-radius:12px;padding:10px 12px;margin-bottom:6px;text-decoration:none;color:#1A1A1A}.fila-l span{font-size:12px;color:#6B6455}
.aviso{background:#FFF3C4;border:1px solid #F0DC92;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:14px;font-weight:500}
.aviso.ruim{background:#FFE4DE;border-color:#F3B8AC}
.topo-pro{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.topo-pro input{flex:1;min-width:200px;border:1px solid #EFE6C8;border-radius:999px;padding:10px 14px;font:14px Poppins,sans-serif;background:#fff}
.topo-pro span{font-size:13px;color:#5E574A}
.pro-l{display:flex;gap:12px}
.pro-l img,.pro-l .ini{width:64px;height:64px;border-radius:14px;object-fit:cover;flex:none;background:#FFC800;display:grid;place-items:center;font-weight:700;font-size:24px}
.pro .mini{font-size:12px;color:#5E574A;margin:0}
.pro.oculto{opacity:.65}
.an-prev{display:flex;min-height:110px;border:1.5px solid #E6DAB0}
.an-img{flex:0 0 58%;background:#fff center/contain no-repeat}
.an-bt{flex:1;display:flex;align-items:center;justify-content:center;background:#ECE7D8;padding:8px}
.an-bt span{width:100%;text-align:center;background:#1A1A1A;color:#fff;border-radius:4px;padding:10px 6px;font-weight:700;font-size:13px}
.cx h3 small{color:#6B6455;font-weight:500}
.eu{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.eu-l b{display:block;font-size:14px}.eu-l span{font-size:12px;color:#6B6455}
.fotos-acoes{border-top:1px solid #F3ECD4;padding-top:10px}
details.editar{margin-top:10px}details.editar summary{list-style:none;display:inline-block}details.editar summary::-webkit-details-marker{display:none}
details.editar[open] summary{background:#1A1A1A;color:#FFC800}
.ed{display:grid;gap:10px;margin-top:10px;background:#FFFAEA;border:1px solid #EFE6C8;border-radius:12px;padding:12px}
.ed-l{display:grid;gap:4px;font-size:12px;font-weight:600;color:#5E574A}
.ed input:not([type=checkbox]),.ed textarea,.ed select{width:100%;border:1px solid #E1D5AE;border-radius:10px;padding:9px 10px;font:14px Poppins,sans-serif;color:#1A1A1A;background:#fff}
.ed-g{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ed-raio label{white-space:nowrap}
.ed-dica{display:block;font-size:12px;color:#8A8271;margin-top:4px;font-weight:400}
.ed-base{display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #EFE6C8;border-radius:10px;font:500 14px Poppins,sans-serif;background:#fff}
.ed-cids,.ed-dias,.ed-chips{display:flex;flex-wrap:wrap;gap:6px}
.ed-servs{max-height:300px;overflow-y:auto;display:grid;gap:8px;border:1px solid #EFE6C8;border-radius:10px;padding:8px;background:#fff}
.ed-gt{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6B6455;margin-bottom:4px}
.ed-conta{font-weight:500;color:#6B6455}
.ed-servs label:has(input:checked),.ed-cids label:has(input:checked),.ed-dias label:has(input:checked){background:#FFC800;border-color:#FFC800}
.ed-servs label:has(input:disabled){opacity:.45}
.ed-cids label,.ed-dias label,.ed-chips label{font-size:13px;font-weight:500;color:#1A1A1A;background:#fff;border:1px solid #EFE6C8;border-radius:999px;padding:4px 10px;display:flex;align-items:center;gap:4px}
.fotos-acoes label.b{cursor:pointer}
.mini-trab{display:flex;gap:4px;margin:2px 0 6px}.mini-trab img{width:40px;height:40px;object-fit:cover;border-radius:8px}
</style></head><body>
<header><div class="in">
  <h1><i></i>Painel da Kiiro</h1>
  <nav class="abas">${abaLink("resumo", "Resumo")}${abaLink("graficos", "Gráficos")}${abaLink("profissionais", "Profissionais")}${abaLink("anuncios", "Anúncios")}${abaLink("pagamentos", "Pagamentos")}${abaLink("pedidos", "Pedidos")}${abaLink("indicacoes", "Avaliações por link")}${abaLink("chamadas", "Chamadas")}${abaLink("disparos", "Disparos")}${abaLink("contas", "Contas")}${abaLink("avisos", "Avisos")}${abaLink("lembretes", "Lembretes")}</nav>
</div></header>
<main>${html}</main>
</body></html>`;

  return new Response(pagina, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
};

/* ---------- disparos ---------- */
const MODELOS_PADRAO = [
  { id: "avaliacoes", nome: "Pedir avaliações", texto: "Oi, {nome}! Aqui é da Kiiro 💛\n\nAgora seu perfil pode receber avaliações de quem já conhece seu trabalho: clientes antigos, vizinhos, amigos. Elas aparecem no seu perfil, contam na sua nota e fazem mais gente te chamar.\n\nÉ só encaminhar a mensagem abaixo para seus clientes e conhecidos 👇\n\n—\n\nOi! Tudo bem? 😊 Estou na Kiiro, o app de profissionais do Litoral Norte.\n\nVocê que já fez serviço comigo ou conhece meu trabalho pode me deixar uma avaliação? É só tocar nas estrelas, leva 1 minuto:\n👉 {link_avaliacao}\n\nAjuda muito, obrigado! 🙏" },
  { id: "doacao", nome: "Pedir doação", texto: "Oi, {nome}! Aqui é da Kiiro 💛\n\nQue bom que a Kiiro te ajudou a fechar serviço! A Kiiro é grátis para os profissionais e se mantém com doações.\n\nSe puder, apoie com qualquer valor pelo Pix, leva 1 minuto:\n👉 {link_doacao}\n\nMuito obrigado pela parceria! 🙏" },
  { id: "conta", nome: "Novidade: área do profissional", texto: "Oi, {nome}! Aqui é da Kiiro 💛\n\nNovidade: agora você tem uma área só sua na Kiiro. Lá você vê quantas pessoas viram seu perfil, quem te chamou e pode anotar os serviços que fechou.\n\nÉ só criar sua conta com este mesmo WhatsApp:\n👉 {site}/conta\n\nQualquer dúvida, é só chamar!" },
];
async function lerModelos(admin) {
  const l = await admin.get("modelos", { type: "json" });
  return Array.isArray(l) ? l : MODELOS_PADRAO.map((m) => ({ ...m }));
}
// troca {nome}, {link_avaliacao}... pelos dados de cada profissional
function preencher(texto, p, base) {
  const nm = String(p.nome || "").trim();
  const nome = nm.length <= 26 && /\b(borracharia|loja|oficina|auto|comércio|comercio|serviços|servicos|ltda|me|mei|cia)\b/i.test(nm) ? nm : nm.split(/\s+/)[0];
  const d = { nome, link_avaliacao: `${base}/i/${p.id}`, link_doacao: `${base}/d/${p.id}`, link_perfil: `${base}/#p-${p.id}`, servico: ((p.categorias || [p.categoria])[0] || "").toLowerCase(), cidade: p.cidade || "", site: base };
  return String(texto).replace(/\{(\w+)\}/g, (m, k) => (k in d ? d[k] : m));
}
