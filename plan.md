# Plano: Adicionar Gaps Sem Colunas no Gráfico de Liquidação

## Objetivo
Atender à solicitação do usuário para que o gráfico da página "Liquidation Test" apresente espaços vazios (gaps sem colunas) nos níveis de preço onde não houver volume de liquidação. 

## Análise Arquitetural
Atualmente, o gráfico utiliza uma escala `CategoryScale` no eixo X (o padrão do Chart.js para gráficos de barra sem definir o tipo do eixo). Isso faz com que apenas os preços que possuem volume sejam listados lado a lado, sem respeitar a distância visual/proporcional entre eles (por exemplo, a distância entre $60.000 e $60.100 parece visualmente a mesma que a de $60.100 e $65.000).

Para exibir as colunas de forma contínua com zeros onde não houver volume, existem duas estratégias principais para o Chart.js:

1. **Preenchimento de Bins (Histórico de Categorias):** 
   Na função `aggregateByPriceInterval`, em vez de criar caixas (bins) apenas para os preços que existem, nós calculamos o preço mínimo e máximo do período, e geramos *todos* os intervalos intermediários possíveis preenchidos com zero volume.
   - **Pró:** Simples de implementar, mantém o eixo categórico impecável, perfeito quando um intervalo está definido (ex: $100).
   - **Contra:** Apenas funciona bem se houver um `priceInterval` definido maior que zero.

2. **Mudar o Eixo X para Escala Linear (`type: 'linear'`):**
   Alterar o eixo X do `LiquidationChart` para numérico contínuo. 
   - **Pró:** Automaticamente posiciona os preços na distância correta, criando os espaços vazios naturalmente, mesemo quando `priceInterval == 0`.
   - **Contra:** Gráficos de barra em eixos X lineares no Chart.js podem exigir configurações manuais de largura de barra (`barPercentage`, `categoryPercentage`) para que as barras não fiquem excessivamente finas ou se sobreponham aleatoriamente se o zoom mudar.

## Proposta de Implementação (Estratégia Recomendada)

Visto que os mapas de liquidação (como o do Coinglass/Binance) geralmente agem como um *Histograma*, a solução ideal envolve modificar a agregação de dados e garantir a visualização correta independentemente das configurações:

1. Modificar o backend do `aggregateByPriceInterval` em `src/pages/LiquidationTest.tsx`:
   - Quando houver um intervalo (`interval > 0`), identificar primeiro o preço mais baixo e o mais alto.
   - Inicializar o objeto `aggregated` com **todas** as fatias/ranges entre o mínimo e máximo, com volume zero.
   - Isso garantirá que o eixo categórico tenha espaços vazios literais para valores que não constam com volume.

2. Avaliar se adotamos escala numérica contínua em X:
   - Alterar o `scales.x.type` para `'linear'` se o `priceInterval` for `0` (assim mostra saltos corretos) ou sempre.
   - Faremos o mapeamento dos conjuntos de dados (datasets) com objetos numéricos `{x: price, y: volume}` para lidar com a escala corretamente.
   - Ajustaremos opções como o grid e tooltip para continuar funcionando.

## Próximos Passos
Por favor, responda se aprova a estratégia de preencher os intervalos nulos (e/ou adotar a escala linear para o eixo X) para que iniciemos a implementação desta forma.
