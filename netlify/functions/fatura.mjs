// Kiiro — faturas dos anúncios, lado da empresa.
// GET  /.netlify/functions/fatura?f=ID           → dados da fatura (para a página /pagar)
// POST { acao: "nova", id, empresa, contato, formato, grupo, cidade, meses } → cria a 1ª fatura do pedido de anúncio
// POST { acao: "paguei", id }                    → a empresa avisa que fez o Pix (fica "a confirmar" no painel)
import { lerFaturas, salvarFaturas, lerPrecos, valorDe, publica, idValido, diaSP, somaDias, reais, NOMES, avisarNoCelular } from "../lib/faturas.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const txt = (s, n) => String(s || "").trim().slice(0, n);

export default async (req) => {
  const site = (process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("f");
    if (!idValido(id)) return json(400, { erro: "Fatura inválida" });
    const f = (await lerFaturas())[id];
    return f && f.status !== "cancelada" ? json(200, publica(f)) : json(404, { erro: "Fatura não encontrada" });
  }
  if (req.method !== "POST") return json(405, { erro: "Use GET ou POST" });
  let d; try { d = await req.json(); } catch { return json(400, { erro: "JSON inválido" }); }
  if (!idValido(d.id)) return json(400, { erro: "Código inválido" });
  const faturas = await lerFaturas();

  if (d.acao === "nova") {
    if (faturas[d.id]) return json(200, publica(faturas[d.id])); // já existe (a pessoa recarregou a página)
    const formato = NOMES[d.formato] ? d.formato : "";
    if (!formato || !txt(d.empresa, 60)) return json(400, { erro: "Faltam dados" });
    const meses = formato === "temporada" ? 4 : Math.min(12, Math.max(1, parseInt(d.meses, 10) || 1));
    const { precos } = await lerPrecos(site);
    const valor = valorDe(precos, formato, meses);
    if (!(valor > 0)) return json(400, { erro: "Valor não encontrado" });
    const hoje = diaSP(Date.now());
    const onde = [formato === "cidade" || formato === "inicio" ? "" : txt(d.grupo, 40), /cidade/.test(formato) ? txt(d.cidade, 40) : ""].filter(Boolean).join(" · ");
    faturas[d.id] = {
      id: d.id, tipo: "inicial", pedido: d.id, anuncio: "",
      empresa: txt(d.empresa, 60), contato: txt(d.contato, 20), formato, onde, meses, valor,
      descricao: `${NOMES[formato]}${onde ? " · " + onde : ""} · ${meses} ${meses > 1 ? "meses" : "mês"}`,
      periodo: formato === "temporada" ? "Dezembro a março" : `${meses} ${meses > 1 ? "meses" : "mês"} a partir da aprovação`,
      vence: somaDias(hoje, 3), status: "pendente", criada: new Date().toISOString(),
    };
    await salvarFaturas(faturas);
    return json(200, publica(faturas[d.id]));
  }

  if (d.acao === "paguei") {
    const f = faturas[d.id];
    if (!f || f.status === "cancelada") return json(404, { erro: "Fatura não encontrada" });
    if (f.status === "pendente") {
      f.status = "informado"; f.informadoEm = new Date().toISOString();
      await salvarFaturas(faturas);
      await avisarNoCelular({
        title: `💰 ${f.empresa} avisou que pagou ${reais(f.valor)}`,
        message: `${f.descricao}\nConfira o Pix (identificador ${f.id}) e confirme no painel, aba Pagamentos.`,
        tags: ["moneybag"], click: `${site}/painel`,
      });
    }
    return json(200, publica(f));
  }
  return json(400, { erro: "Ação desconhecida" });
};
