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
    "Decoração de festa", "Buffet", "Bolos e doces", "Fotógrafo", "DJ"
  ]},
  { grupo: "Freelas de cozinha e salão", icone: "cozinha", itens: [
    "Cozinheiro(a) freela", "Auxiliar de cozinha freela", "Garçom freela", "Churrasqueiro freela", "Pizzaiolo freela", "Bartender freela", "Copeiro(a) freela"
  ]},
  { grupo: "Cuidados e aulas", icone: "cuidado", itens: [
    "Cuidador de idosos", "Babá", "Passeador e cuidador de pets", "Aulas particulares"
  ]},
  { grupo: "Outros", icone: "outro", itens: [
    "Costureira", "Plotagem e envelopamento"
  ]}
];

// nomes antigos que mudaram (cadastros antigos continuam aparecendo no lugar certo)
window.KIIRO_SERVICOS_ANTIGOS = { "Ar-condicionado": "Técnico de ar-condicionado", "Garçom": "Garçom freela" };

// Palavras do dia a dia que levam a cada serviço na busca (ex.: "vazamento" → Encanador).
// Para melhorar a busca, é só acrescentar palavras aqui.
window.KIIRO_PALAVRAS = {
  "Eletricista": ["tomada", "chuveiro", "luz", "disjuntor", "fiação", "fio", "curto", "lâmpada", "luminária", "quadro de luz", "energia", "interruptor", "resistência", "padrão de luz"],
  "Encanador": ["vazamento", "vazando", "cano", "torneira", "descarga", "privada", "vaso sanitário", "pia", "esgoto", "entupido", "entupimento", "desentupir", "registro", "infiltração", "hidráulica", "caixa acoplada", "ralo"],
  "Pedreiro": ["obra", "reforma", "muro", "parede", "reboco", "contrapiso", "piso", "construção", "laje", "alvenaria", "calçada"],
  "Pintor": ["pintura", "pintar", "tinta", "parede", "fachada", "textura", "grafiato", "verniz"],
  "Marceneiro": ["móvel planejado", "madeira", "armário", "porta de madeira", "marcenaria"],
  "Montador de móveis": ["montar móvel", "montagem", "guarda-roupa", "roupeiro", "cama", "estante", "desmontar"],
  "Marido de aluguel": ["conserto", "consertar", "pequenos reparos", "furar parede", "pendurar", "trocar", "faz-tudo", "reparo"],
  "Gesseiro": ["gesso", "forro", "drywall", "sanca", "rebaixamento"],
  "Azulejista": ["azulejo", "porcelanato", "cerâmica", "rejunte", "revestimento", "assentar piso"],
  "Telhadista": ["telhado", "telha", "goteira", "calha", "rufo"],
  "Vidraceiro": ["vidro", "espelho", "box", "janela de vidro", "blindex"],
  "Serralheiro": ["portão", "grade", "solda", "ferro", "serralheria", "corrimão"],
  "Marmoraria": ["mármore", "granito", "bancada", "pedra", "soleira"],
  "Chaveiro": ["chave", "fechadura", "trancado", "porta trancada", "cópia de chave", "cadeado"],
  "Rede de proteção": ["rede", "tela de proteção", "sacada", "janela", "gato"],
  "Instalação de fogão": ["fogão", "gás", "botijão", "cooktop"],
  "Instalação de coifa": ["coifa", "depurador", "exaustor"],
  "Técnico de ar-condicionado": ["ar condicionado", "ar-condicionado", "split", "climatização", "não gela", "limpeza do ar", "instalação de ar"],
  "Portão eletrônico": ["portão automático", "motor do portão", "controle do portão"],
  "Fechadura eletrônica": ["fechadura digital", "senha", "biometria"],
  "Câmeras e alarmes": ["câmera", "alarme", "segurança", "cftv", "monitoramento", "cerca elétrica", "interfone"],
  "Antenista": ["antena", "parabólica", "sinal de tv", "tv"],
  "Técnico de eletrodomésticos": ["geladeira", "máquina de lavar", "lavadora", "micro-ondas", "freezer", "secadora", "conserto de eletrodoméstico"],
  "Diarista": ["faxina", "faxineira", "limpeza", "limpar casa", "doméstica", "empregada", "arrumar casa"],
  "Passadeira": ["passar roupa", "roupa", "ferro de passar"],
  "Limpeza pós-obra": ["pós obra", "pós-obra", "sujeira de obra", "limpeza pesada"],
  "Limpeza de sofá e estofados": ["sofá", "estofado", "colchão", "tapete", "higienização", "cadeira"],
  "Limpeza de vidros e blindex": ["vidros", "janelas", "blindex", "limpar vidro"],
  "Dedetização": ["barata", "cupim", "rato", "formiga", "inseto", "praga", "mosquito", "dedetizar"],
  "Limpeza de caixa d'água": ["caixa d'água", "caixa dagua", "reservatório", "cisterna"],
  "Jardineiro": ["grama", "gramado", "cortar grama", "roçada", "roçar", "jardim", "pátio", "capina", "plantas", "paisagismo"],
  "Piscineiro": ["piscina", "água verde", "cloro", "limpar piscina", "filtro da piscina"],
  "Caseiro": ["cuidar da casa", "casa de praia", "zelador", "vigiar casa", "temporada"],
  "Poda de árvores": ["poda", "podar", "árvore", "galho", "corte de árvore"],
  "Limpeza de terreno": ["terreno", "lote", "mato", "capinar", "roçada de terreno", "entulho"],
  "Motoboy": ["entrega", "entregar", "moto", "buscar", "levar", "documento", "farmácia", "tele-entrega"],
  "Frete": ["carreto", "levar móvel", "transporte", "camionete", "pickup", "caminhonete"],
  "Caminhão de mudança": ["mudança", "mudar de casa", "caminhão"],
  "Ajudante de mudança": ["carregar", "ajudante", "mudança", "chapa"],
  "Manicure e pedicure": ["unha", "unhas", "esmalte", "pé", "mão", "alongamento de unha", "gel"],
  "Designer de sobrancelhas": ["sobrancelha", "henna", "micropigmentação", "cílios"],
  "Cabeleireiro": ["cabelo", "corte", "escova", "progressiva", "luzes", "barbeiro", "barba", "salão"],
  "Maquiadora": ["maquiagem", "make", "noiva", "formatura"],
  "Massagista": ["massagem", "drenagem", "relaxante", "dor nas costas"],
  "Personal trainer": ["treino", "academia", "exercício", "emagrecer", "personal"],
  "Decoração de festa": ["decoração", "balão", "balões", "aniversário", "festa infantil", "mesa de festa"],
  "Buffet": ["comida", "salgados", "festa", "churrasco", "jantar", "evento"],
  "Bolos e doces": ["bolo", "doces", "docinhos", "brigadeiro", "torta", "confeitaria"],
  "Fotógrafo": ["foto", "fotos", "fotografia", "ensaio", "casamento", "filmagem"],
  "DJ": ["som", "música", "festa", "dj"],
  "Garçom freela": ["garçom", "garçonete", "atendimento", "servir", "salão", "freelancer", "freela", "extra", "temporada"],
  "Cozinheiro(a) freela": ["cozinheira", "cozinheiro", "cozinha", "chef", "comida", "freela de cozinha", "almoço", "marmita"],
  "Auxiliar de cozinha freela": ["auxiliar", "ajudante de cozinha", "lavar louça", "louça", "preparo", "cozinha"],
  "Churrasqueiro freela": ["churrasco", "churrasqueira", "assador", "carne", "costela"],
  "Pizzaiolo freela": ["pizza", "pizzaria", "forno"],
  "Bartender freela": ["bar", "drinks", "drink", "barman", "caipirinha", "coquetel"],
  "Copeiro(a) freela": ["copa", "copeira", "café", "lanche"],
  "Cuidador de idosos": ["idoso", "idosa", "cuidadora", "acompanhante", "cuidar de idoso", "enfermagem"],
  "Babá": ["criança", "bebê", "babá", "cuidar de criança"],
  "Passeador e cuidador de pets": ["cachorro", "cão", "gato", "pet", "passear", "dog walker", "hospedagem pet"],
  "Aulas particulares": ["aula", "reforço", "professor", "professora", "matemática", "inglês", "tarefa"],
  "Costureira": ["costura", "ajuste de roupa", "barra", "conserto de roupa", "bainha"],
  "Plotagem e envelopamento": ["adesivo", "plotagem", "envelopar", "envelopamento", "carro", "fachada adesivada"]
};
