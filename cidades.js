// As 21 cidades do Litoral Norte do RS (COREDE Litoral) + Santo Antônio da Patrulha. Para incluir outra, é só adicionar aqui.
window.KIIRO_CIDADES = [
  "Arroio do Sal", "Balneário Pinhal", "Capão da Canoa", "Capivari do Sul", "Caraá",
  "Cidreira", "Dom Pedro de Alcântara", "Imbé", "Itati", "Mampituba", "Maquiné",
  "Morrinhos do Sul", "Mostardas", "Osório", "Palmares do Sul", "Santo Antônio da Patrulha",
  "Terra de Areia",
  "Torres", "Tramandaí", "Três Cachoeiras", "Três Forquilhas", "Xangri-Lá"
];
window.KIIRO_TODAS = "Todo o Litoral Norte";

// Centro aproximado de cada cidade (para "Perto de mim" e para a distância que o profissional atende)
window.KIIRO_COORD = {
  "Arroio do Sal": [-29.55, -49.89], "Balneário Pinhal": [-30.24, -50.23], "Capão da Canoa": [-29.75, -50.01],
  "Capivari do Sul": [-30.14, -50.52], "Caraá": [-29.79, -50.43], "Cidreira": [-30.18, -50.21],
  "Dom Pedro de Alcântara": [-29.36, -49.85], "Imbé": [-29.965, -50.125], "Itati": [-29.42, -50.10],
  "Mampituba": [-29.21, -49.93], "Maquiné": [-29.68, -50.21], "Morrinhos do Sul": [-29.36, -49.93],
  "Mostardas": [-31.11, -50.92], "Osório": [-29.89, -50.27], "Palmares do Sul": [-30.26, -50.51],
  "Santo Antônio da Patrulha": [-29.82, -50.52], "Terra de Areia": [-29.58, -50.07], "Torres": [-29.34, -49.73],
  "Tramandaí": [-29.985, -50.135], "Três Cachoeiras": [-29.45, -49.93], "Três Forquilhas": [-29.53, -50.07],
  "Xangri-Lá": [-29.80, -50.04]
};
// distância aproximada em km, em linha reta (pela estrada é um pouco mais)
window.kiiroKm = function (a, b) {
  const A = window.KIIRO_COORD[a], B = window.KIIRO_COORD[b];
  if (!A || !B) return null;
  const x = (B[1] - A[1]) * Math.cos((A[0] + B[0]) / 2 * Math.PI / 180), y = B[0] - A[0];
  return Math.round(Math.sqrt(x * x + y * y) * 111.2);
};

// Chave do Google Maps (mapa do perfil). Crie em console.cloud.google.com, ative "Maps JavaScript API"
// e restrinja a chave ao site (chamakiiro.netlify.app/*). Deixe vazio para usar o mapa aberto (OpenStreetMap).
window.KIIRO_GOOGLE_MAPS_KEY = "";
