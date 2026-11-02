// Lista de serviços da Kiiro, por grupo. Para incluir um serviço, é só colocar o nome no grupo certo.
window.KIIRO_SERVICOS = [
  { grupo: "Casa e reforma", icone: "casa", itens: [
    "Eletricista", "Encanador", "Pedreiro", "Pintor", "Marceneiro", "Montador de móveis",
    "Marido de aluguel", "Gesseiro", "Azulejista", "Telhadista", "Vidraceiro", "Serralheiro",
    "Marmoraria", "Chaveiro", "Rede de proteção", "Instalação de fogão", "Instalação de coifa"
  ]},
  { grupo: "Climatização e segurança", icone: "clima", itens: [
    "Técnico de ar-condicionado", "Portão eletrônico", "Fechadura eletrônica",
    "Câmeras e alarmes", "Antenista", "Técnico de eletrodomésticos"
  ]},
  { grupo: "Limpeza", icone: "limpeza", itens: [
    "Diarista", "Passadeira", "Limpeza pós-obra", "Limpeza de sofá e estofados",
    "Limpeza de vidros e blindex", "Dedetização", "Limpeza de caixa d'água"
  ]},
  { grupo: "Casa de praia e jardim", icone: "jardim", itens: [
    "Jardineiro", "Piscineiro", "Caseiro", "Poda de árvores", "Limpeza de terreno"
  ]},
  { grupo: "Transporte e mudança", icone: "transporte", itens: [
    "Motoboy", "Frete", "Caminhão de mudança", "Ajudante de mudança"
  ]},
  { grupo: "Beleza e bem-estar", icone: "beleza", itens: [
    "Manicure e pedicure", "Designer de sobrancelhas", "Cabeleireiro", "Maquiadora",
    "Massagista", "Personal trainer"
  ]},
  { grupo: "Festas e eventos", icone: "festa", itens: [
    "Decoração de festa", "Buffet", "Bolos e doces", "Fotógrafo", "DJ", "Garçom"
  ]},
  { grupo: "Cuidados e aulas", icone: "cuidado", itens: [
    "Cuidador de idosos", "Babá", "Passeador e cuidador de pets", "Aulas particulares"
  ]},
  { grupo: "Outros", icone: "outro", itens: [
    "Costureira", "Plotagem e envelopamento"
  ]}
];

// nomes antigos que mudaram (cadastros antigos continuam aparecendo no lugar certo)
window.KIIRO_SERVICOS_ANTIGOS = { "Ar-condicionado": "Técnico de ar-condicionado" };
