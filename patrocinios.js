// Patrocínios da Kiiro.
// Onde aparece (do mais específico para o mais amplo):
//   1. Serviço na cidade:  categoria = grupo ou serviço, alvoCidade: "Osório"
//   2. Cidade inteira:     categoria = "Todos",          alvoCidade: "Osório"
//   3. Serviço no litoral: categoria = grupo ou serviço, sem alvoCidade
//   4. Página inicial:     categoria = "Todos",          sem alvoCidade (até 5, em rodízio)
// Quando mais de um cabe no mesmo lugar, eles ficam girando.
// O anúncio aparece como banner: "banner" (imagem larga, ex. 1200x500) ou "logo" + "cor" de fundo.
// categoria: "Todos" (página inicial) ou o nome exato do GRUPO, como está em servicos.js:
//   "Casa e reforma", "Climatização e segurança", "Limpeza", "Casa de praia e jardim",
//   "Transporte e mudança", "Beleza e bem-estar", "Festas e eventos", "Freelas de cozinha e salão", "Cuidados e aulas".
// O patrocínio do grupo aparece em todos os serviços dele (ex.: Casa e reforma → Eletricista, Pedreiro…).
// Exclusividade de um serviço só: use o nome do serviço (ex.: "Eletricista"); ele vale antes do grupo.
// No mapa da página inicial (como no Waze): aparece com o logo na cidade do anúncio ("alvoCidade" ou "cidade"),
// ou no lugar exato da loja com local: [latitude, longitude] (copie do Google Maps: segure o dedo na loja).
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
    logo: "img/patrocinadores/ns-aparecida.jpg", banner: "img/patrocinadores/ns-aparecida-banner.jpg", cor: "#ffffff", ate: "" },
];

// Mostrar "Este espaço pode ser seu" onde não tem patrocinador?
window.KIIRO_ANUNCIE = true;

// Preços que aparecem na página Anuncie (por mês). Apague um para mostrar "sob consulta".
window.KIIRO_PRECOS = { servicoCidade: 10, cidade: 15, servico: 15, inicio: 20, temporada: "60 (dez–mar)" };

// Pagamento dos anúncios. Coloque aqui a chave Pix (aleatória) — aparece na tela final do anúncio
// e na mensagem de renovação. Deixe vazio para não mostrar.
window.KIIRO_PIX = { chave: "fcf24722-5ab9-46d6-ac2f-cd752a284077", titular: "" };
