# Plano de Migração: Arquitetura Frontend-Only (Serverless)

## 📌 Objetivo
Eliminar a dependência do backend em Python e hospedar 100% do projeto no GitHub Pages. Todo o processamento e as chamadas de API passarão a ser feitos diretamente pelo navegador do usuário (React/Vite).

## 🚧 Desafios e Limitações Esperadas
1. **Problemas de CORS:** Chamadas diretas para APIs (Coinalyze, Binance, CoinGecko) podem ser bloqueadas pelo CORS dos navegadores. Usaremos um *CORS Proxy* gratuito (ex: `corsproxy.io` ou AllOrigins) caso as APIs bloqueiem.
2. **Exposição de Chaves de API:** As chaves (ex: Coinalyze API Key) teriam que ficar expostas ou serem digitadas pelo usuário no navegador.
3. **Sem WebSockets Globais:** Sem o nosso backend, teremos que tentar conectar diretamente aos WebSockets públicos da Binance/Coinalyze no frontend.

## 🛠️ Passos de Implementação

### Passo 1: Configuração de API Keys no Frontend
- Criar um modal/página de "Configurações" onde o próprio usuário insere sua *API Key* da Coinalyze (e qualquer outra necessária).
- Salvar essas chaves de forma segura no `localStorage` do navegador para que ele não precise digitar toda vez que abrir o site.

### Passo 2: Refatoração do Serviço de API (`api.ts`)
- Alterar as URLs do `api.ts` que atualmente apontam para `VITE_API_URL` (nosso antigo backend).
- Fazer com que o `api.ts` chame **diretamente** as APIs públicas.
    - **Preços:** Binance API (ex: `https://api.binance.com/api/v3/klines`). A Binance geralmente permite CORS.
    - **Liquidações:** Coinalyze API (ex: `https://api.coinalyze.net/v1/liquidation-history`). Se a Coinalyze bloquear (CORS), enveloparemos a URL em um *CORS Proxy* gratuito.

### Passo 3: Refatoração dos WebSockets (`useWebSocket.ts`)
- Desativar a conexão com o nosso backend (`wss://.../ws`).
- Substituir pelas conexões diretas:
    - Preço em tempo real: Ligar no WebSocket público da Binance (`wss://stream.binance.com:9443/ws/btcusdt@trade`).
    - Liquidações em tempo real: Investigar se a Coinalyze permite conexões públicas ou usar outra fonte (ex: Binance futures stream).

### Passo 4: Limpeza do Repositório
- Se aprovado o funcionamento estrito via frontend, os arquivos da pasta `/backend` e `/docker` podem ser arquivados ou ignorados no deploy.
- Remover os scripts relacionados ao backend no GitHub Actions.

## 📝 Verificação
Você concorda com essa migração? Entende que ao compartilhar o link do GitHub Pages para outras pessoas, elas também precisarão inserir a própria chave de API da Coinalyze no site?
