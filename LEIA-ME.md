# Kiiro: como subir no Netlify

## O que tem aqui

| Arquivo | O que é |
|---|---|
| `index.html` | Página inicial com a lista de profissionais |
| `cadastro.html` | Cadastro de profissional (salva em Netlify Forms > cadastro) |
| `cadastro-ok.html` | Tela de "Cadastro recebido" |
| `avaliar.html` | Tela onde o cliente avalia (abre pelo link que você manda) |
| `estilo.css` | Visual de todas as páginas |
| `cidades.js` | Lista das 21 cidades (para incluir outra, edite aqui) |
| `netlify/functions/` | As funções: lista, perfil, chamada, avaliação, painel e aviso de cadastro novo |
| `netlify.toml` | Configuração e endereços curtos (/cadastro, /avaliar, /painel) |
| `package.json` | Pacote que as funções usam (o Netlify instala sozinho) |

## Passo a passo

1. **GitHub:** crie um repositório (ex.: `kiiro-site`) e envie todos estes arquivos para a raiz, sem pasta por cima.
2. **Netlify:** Add new site > Import an existing project > GitHub > escolha o repositório. Deixe build command vazio e publish directory `.`. Clique em Deploy.
   - Não use "arrastar a pasta". Desse jeito as funções não funcionam.
3. **Token:** no Netlify, User settings > Applications > Personal access tokens > New access token. Copie o token.
4. **Variáveis:** no site, Site configuration > Environment variables, crie:

| Nome | Valor |
|---|---|
| `NETLIFY_TOKEN` | o token do passo 3 |
| `NTFY_TOPIC` | o canal do app ntfy, difícil de adivinhar (ex.: `kiiro-avisos-8x2q7m`) |
| `ADMIN_KEY` | uma senha longa para o seu painel |
| `FORM_NAME` | (opcional) `cadastro`, que já é o padrão |
| `APROVADOS` | (opcional) WhatsApps liberados, separados por vírgula. Vazio = todo mundo aparece |

5. **Deploy de novo:** Deploys > Trigger deploy, para as variáveis valerem.
6. **Celular:** instale o app **ntfy**, toque em + e assine o mesmo canal do `NTFY_TOPIC`.

## Endereços

- Site: `https://SEU-SITE.netlify.app`
- Cadastro: `https://SEU-SITE.netlify.app/cadastro`
- Seu painel: `https://SEU-SITE.netlify.app/painel?chave=SUA_ADMIN_KEY` (salve nos favoritos)

## O que chega no seu celular

- 🆕 Novo cadastro de profissional
- 🔔 Cliente chamou um profissional (tocar abre o WhatsApp do cliente)
- ⚠️ Avaliação de 1 ou 2 estrelas
- ℹ️ Cliente disse que o serviço não foi feito
- 📷 Cliente mandou foto na avaliação (para ocultar: painel → Ocultar foto)
- ⭐ Todo dia às 9h: "Pedir avaliação" para cada cliente que chamou alguém e ainda não avaliou (tocar abre o WhatsApp com o link pronto)

## Como tirar alguém da lista

No Netlify: Forms > cadastro > abra o cadastro > Mark as spam (ou Delete). Some do site em até 2 minutos.

## Trocar o WhatsApp da Kiiro

Em `index.html` e `avaliar.html`, procure `KIIRO_WHATS`.

## Patrocínio

Na lista de profissionais, depois do 3º card, aparece um espaço de patrocínio:
- Se a categoria tem patrocinador, aparece o card dele (com a etiqueta "Patrocinado").
- Se não tem, aparece "Este espaço pode ser seu", com botão para a empresa chamar a Kiiro no WhatsApp.

Para colocar um patrocinador, edite `patrocinios.js` (tem um exemplo dentro). Use `"Todos"` para a página inicial
ou o nome exato do serviço (ex.: `"Eletricista"`). Depois da data `ate`, o espaço volta a ficar disponível sozinho.
