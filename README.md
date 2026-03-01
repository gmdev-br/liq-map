# Coinglass Dashboard 

Este projeto é um dashboard frontend-only (Serverless) focado em dados de mercado de criptomoedas, desenhado para ser hospedado diretamente no GitHub Pages sem a necessidade de um servidor backend.

## 🚀 Como Funciona

Toda a captação de dados é feita diretamente pelo seu navegador usando APIs públicas:
- **Preços e Gráficos:** Puxados via REST e WebSocket da Binance.
- **Liquidações:** Puxadas da API pública da Coinalyze (via Proxy CORS).

## 🔑 Configuração Primeira Vez

Ao acessar a página pela primeira vez, você precisará configurar suas chaves:
1. Abra as **Settings (Configurações)** no menu lateral do dashboard.
2. Insira sua **API Key da Coinalyze** (você pode gerar uma gratuitamente no site deles).
3. Salve. A chave ficará guardada localmente no seu navegador de forma segura e não será enviada para nenhum servidor próprio nosso.

## 🛠️ Tecnologias Utilizadas
- **Frontend:** React, Vite, Chart.js, Tailwind CSS.
- **Hospedagem:** GitHub Pages (Deploy automático via GitHub Actions).
- **Conectividade:** WebSockets públicos da Binance e cliente HTTP Axios.
