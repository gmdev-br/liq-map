# Plano de Implementação: Modo Multi-Ativo (Liquidação)

## Objetivo
Criar um modo multi-ativo na página de Teste de Liquidação (`LiquidationTest.tsx`), permitindo selecionar múltiplos ativos e agregá-los no mesmo gráfico, normalizando seus preços de liquidação para a escala de preço do Bitcoin (BTC).

## Mudanças Propostas no `LiquidationTest.tsx`

1. **Estado e UI:**
   - Adicionar estado `isMultiAssetMode: boolean` para alternar entre o modo padrão (1 ativo) e o modo multi-ativo.
   - Adicionar estado `selectedSymbols: string[]` para armazenar a lista de ativos selecionados no modo multi-ativo.
   - Modificar o seletor de moedas na UI para permitir seleção múltipla (usando checkboxes ou tags) quando o modo multi-ativo estiver ativado.

2. **Transformação e Fetch de Dados:**
   - No modo multi-ativo, alterar o `fetchLiquidationData` para fazer um `Promise.all` e buscar os dados de liquidação e preço de **todos** os ativos selecionados.
   - Forçar a busca do histórico de preços do `BTCUSDT_PERP.A` (ou ativo base do BTC configurado) paralelamente, pois ele será usado como o "Padrão de Preço".
   - **Lógica de Normalização**:
     Para cada registro de liquidação de um ativo alternativo (Altcoin) no tempo $T$:
     - Obter o preço da Altcoin no tempo $T$: $P_{alt}$
     - Obter o preço do BTC no tempo $T$: $P_{btc}$
     - Calcular o preço normalizado conforme a fórmula:
       `Preço Normalizado = P_alt * (P_btc / P_alt) ` (o que resulta magicamente em `P_btc`).
     - Atribuir o volume dessa liquidação ao `Preço Normalizado`.
   - Concatenar e agrupar todos os registros de todos os ativos selecionados, de forma que o gráfico renderize o volume somado de todo o mercado nas faixas de preço do BTC.

3. **Performance (Consideração):**
   - Limitar o número máximo de ativos selecionáveis (ex: 5-10) ou adicionar loading flags adequados, já que o Chart fará múltiplos requests para a API do Coinalyze/Binance simultaneamente.

4. **Detalhamento na Tooltip:**
   - Modificar a interface de dados para rastrear o volume por símbolo em cada faixa de preço.
   - Atualizar a tooltip do gráfico para exibir o detalhamento de quanto cada ativo contribui para o volume total daquela barra.

## Aprovação
Aguardando aprovação do usuário para iniciar a implementação do plano acima.
