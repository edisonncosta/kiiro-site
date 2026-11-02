// Patrocínios da Kiiro.
// Onde aparece (do mais específico para o mais amplo):
//   1. Serviço na cidade:  categoria = grupo ou serviço, alvoCidade: "Osório"
//   2. Cidade inteira:     categoria = "Todos",          alvoCidade: "Osório"
//   3. Serviço no litoral: categoria = grupo ou serviço, sem alvoCidade
//   4. Página inicial:     categoria = "Todos",          sem alvoCidade (até 5, em rodízio)
// Quando mais de um cabe no mesmo lugar, eles ficam girando.
// categoria: "Todos" (página inicial) ou o nome exato do GRUPO, como está em servicos.js:
//   "Casa e reforma", "Climatização e segurança", "Limpeza", "Casa de praia e jardim",
//   "Transporte e mudança", "Beleza e bem-estar", "Festas e eventos", "Cuidados e aulas".
// O patrocínio do grupo aparece em todos os serviços dele (ex.: Casa e reforma → Eletricista, Pedreiro…).
// Exclusividade de um serviço só: use o nome do serviço (ex.: "Eletricista"); ele vale antes do grupo.
// Depois da data "ate", o patrocínio some sozinho e o espaço volta a aparecer como disponível.
//
// Exemplo (apague as barras // para ativar):
// { categoria: "Casa e reforma", nome: "Loja X", cidade: "Osório",
//   texto: "Material elétrico, hidráulico e de construção. Clientes Kiiro ganham 10% de desconto.",
//   botao: "Ver ofertas no WhatsApp", link: "https://wa.me/5551999999999?text=Vi%20voc%C3%AAs%20na%20Kiiro",
//   logo: "", ate: "2026-12-31" },
window.KIIRO_PATROCINIOS = [
  { categoria: "Transporte e mudança", nome: "Borracharia N.S. Aparecida", cidade: "",
    texto: "Borracharia em geral, auto elétrica, auto peças e acessórios. Socorro: (51) 98138‑6653.",
    botao: "Chamar no WhatsApp", link: "https://wa.me/5551980425261?text=Ol%C3%A1!%20Vi%20voc%C3%AAs%20na%20Kiiro.",
    logo: "img/patrocinadores/ns-aparecida.jpg", ate: "" },
];

// Mostrar "Este espaço pode ser seu" onde não tem patrocinador?
window.KIIRO_ANUNCIE = true;

// Preços que aparecem na página Anuncie (por mês). Apague um para mostrar "sob consulta".
window.KIIRO_PRECOS = { servicoCidade: 39, cidade: 79, servico: 99, inicio: 149, temporada: "449 (dez–mar)" };
