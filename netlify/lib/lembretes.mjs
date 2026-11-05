// Kiiro — seus lembretes (aba Lembretes do painel). Ficam no Blobs: store "admin", chave "lembretes".
// Cada lembrete: { id, titulo, data: "AAAA-MM-DD", nota, link, feito, avisos: { vespera, dia } }
import { getStore } from "@netlify/blobs";

// já vem com este cadastrado (o teste grátis do Google Cloud começou em 04/11/2026 e dura 90 dias)
const INICIAIS = [{
  id: "google-cloud-teste",
  titulo: "Ativar a conta completa do Google Cloud",
  data: "2027-02-02",
  nota: "O teste grátis de 90 dias termina por volta desta data. Sem ativar a conta completa, o mapa do Google some do perfil dos profissionais. No Google Cloud: aviso no topo › Ativar conta completa. A cota grátis do Maps continua valendo.",
  link: "https://console.cloud.google.com/billing",
  feito: false, avisos: {},
}];

export const diaSP = (d = Date.now()) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export async function lerLembretes() {
  const l = await getStore({ name: "admin", consistency: "strong" }).get("lembretes", { type: "json" });
  return Array.isArray(l) ? l : INICIAIS.map((x) => ({ ...x }));
}
export async function salvarLembretes(l) {
  await getStore({ name: "admin", consistency: "strong" }).setJSON("lembretes", l);
}
