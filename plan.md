## Objetivo
Atender à solicitação do usuário para:
1.  Que o gráfico de liquidação apresente espaços vazios (gaps sem colunas) nos níveis de preço onde não houver volume de liquidação (Implementado).
2.  Implementar uma linha vertical com a cotação atual do par (como BTC/USDT), com estilo pontilhado vermelho e um label no topo indicando "Current Price: XXXX".

## Proposta de Implementação (Preço Atual)

1.  **Captura do Preço Atual:**
    *   No componente `LiquidationTest`, extrair o último preço da resposta da API em `useCacheData`.
    *   Manter o `currentPrice` no estado do componente.
    *   Passar `currentPrice` para o componente `LiquidationChart`.

2.  **Desenho no Gráfico (Chart.js):**
    *   No `LiquidationChart`, criar um plugin interno para o Chart.js chamado `currentPriceLine`.
    *   O plugin usará o gancho `afterDraw` para desenhar no canvas:
        *   Calcular a posição X usando `chart.scales.x.getPixelForValue(currentPrice)`.
        *   Se o eixo X for categórico (labels formatados), encontrar o índice do label mais próximo ou interpolar para achar a posição X precisa.
        *   Desenhar uma linha pontilhada (`setLineDash`) vermelha.
        *   Desenhar um label flutuante no topo com fundo contrastante e texto "Current Price: $XXXX".

## Verificação
1.  Carregar dados de liquidação.
2.  Verificar se a linha vermelha aparece na posição do preço atual do mercado.
3.  Alterar o símbolo (ex: BTC para ETH) e verificar se a linha se ajusta ao novo preço.
4.  Redimensionar ou dar zoom no gráfico e garantir que a linha permanece vinculada ao preço correto.

