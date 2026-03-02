import re
import os

filepath = r'e:\zed_projects\Coinglass\frontend\src\pages\LiquidationTest.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Imports
import_pattern = r"import {\n    Chart as ChartJS,[\s\S]*?crosshairPlugin\n\);"
new_imports = "import ReactECharts from 'echarts-for-react';\nimport type { EChartsOption } from 'echarts';"
if re.search(import_pattern, content):
    content = re.sub(import_pattern, new_imports, content)
else:
    print("Could not find imports pattern")

# Now we need to replace the LiquidationChart component
# Since regexing the whole component is hard because of balanced braces, let's find the start and end.
start_str = "const LiquidationChart = memo(function LiquidationChart({"
end_str = "});\n\nexport function LiquidationTest() {"

start_index = content.find(start_str)
end_index = content.find(end_str)

if start_index == -1 or end_index == -1:
    print("Could not find LiquidationChart bounds")
    import sys; sys.exit(1)

new_component = """const LiquidationChart = memo(function LiquidationChart({
    data,
    formatCurrency,
    groupBy = 'none',
    currentPrice,
    priceInterval,
    lineStyles = defaultLineStyles,
    gridLineInterval = 1000,
    stdDevData,
    showMeanLine = true,
    showSD0_25 = false,
    showSD0_5 = false,
    showSD1 = true,
    showSD2 = true,
    showSD3 = true,
    horizontal = false,
    symbol,
    tooltipCurrency = 'usd',
}: Omit<LiquidationChartProps, 'formatCurrency'> & { formatCurrency: (v: number) => string }) {
    const chartRef = useRef<ReactECharts>(null);

    // Zoom/Pan persistence keys per symbol
    const zoomKeys = useMemo(() => ({
        start: `liquidation_chart_zoom_start_${symbol}`,
        end: `liquidation_chart_zoom_end_${symbol}`,
    }), [symbol]);

    const resetZoom = useCallback(() => {
        if (chartRef.current) {
            const chart = chartRef.current.getEchartsInstance();
            chart.dispatchAction({
                type: 'dataZoom',
                start: 0,
                end: 100
            });
            localStorage.removeItem(zoomKeys.start);
            localStorage.removeItem(zoomKeys.end);
        }
    }, [zoomKeys]);

    // Sort data for proper axis alignment
    const sortedData = useMemo(() => [...data].sort((a, b) => a.price - b.price), [data]);

    // Calculate yMax for marker scaling
    const yMax = useMemo(() => {
        if (sortedData.length === 0) return 0;
        const maxVol = Math.max(...sortedData.map(d => d.long_volume + d.short_volume));
        return Math.max(1, maxVol * 1.1); // Ensure at least 1
    }, [sortedData]);

    const labels = useMemo(() => sortedData.map(d => d.price), [sortedData]);

    const formatTooltipVolume = useCallback((value: number, referencePrice: number) => {
        if (tooltipCurrency === 'btc') {
            const btcValue = referencePrice > 0 ? value / referencePrice : 0;
            return `₿${btcValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
            const absValue = Math.abs(value);
            let formatted = '';

            if (absValue >= 1e9) {
                formatted = (value / 1e9).toFixed(2) + 'B';
            } else if (absValue >= 1e6) {
                formatted = (value / 1e6).toFixed(2) + 'M';
            } else if (absValue >= 1e3) {
                formatted = (value / 1e3).toFixed(1) + 'k';
            } else {
                formatted = value.toFixed(2);
            }
            return `$${formatted}`;
        }
    }, [tooltipCurrency]);

    const option: EChartsOption = useMemo(() => {
        const markLines: any[] = [];
        
        // Grid Lines
        if (gridLineInterval > 0 && sortedData.length > 0) {
            const minP = sortedData[0].price;
            const maxP = sortedData[sortedData.length - 1].price;
            const first = Math.ceil(minP / gridLineInterval) * gridLineInterval;
            const last = Math.floor(maxP / gridLineInterval) * gridLineInterval;
            
            for (let m = first; m <= last; m += gridLineInterval) {
                markLines.push({
                    xAxis: horizontal ? undefined : m,
                    yAxis: horizontal ? m : undefined,
                    lineStyle: {
                        color: lineStyles.thousandLines.color,
                        width: lineStyles.thousandLines.width,
                        type: lineStyles.thousandLines.dash?.length ? 'dashed' : 'solid',
                    },
                    label: { show: false },
                    tooltip: { show: false }
                });
            }
        }

        // Current Price Line
        if (currentPrice !== null) {
            markLines.push({
                xAxis: horizontal ? undefined : currentPrice,
                yAxis: horizontal ? currentPrice : undefined,
                lineStyle: {
                    color: lineStyles.btcQuoteLine.color,
                    width: lineStyles.btcQuoteLine.width,
                    type: lineStyles.btcQuoteLine.dash?.length ? 'dashed' : 'solid',
                },
                label: { show: false },
                tooltip: { show: false }
            });
        }

        // Standard Deviations Lines
        if (stdDevData && sortedData.length > 0) {
            const { mean, regions } = stdDevData;
            
            if (showMeanLine) {
                markLines.push({
                    xAxis: horizontal ? undefined : mean,
                    yAxis: horizontal ? mean : undefined,
                    lineStyle: { color: '#8b5cf6', width: 2, type: 'solid' },
                    label: { show: false },
                    tooltip: { show: false }
                });
            }

            const addSD = (pMin: number, pMax: number, color: string, dashType: 'solid' | 'dashed' | 'dotted' | number[]) => {
                if (pMin > 0) {
                    markLines.push({ xAxis: horizontal ? undefined : pMin, yAxis: horizontal ? pMin : undefined, lineStyle: { color, width: 2, type: 'dashed' }, label: { show: false }, tooltip: { show: false } });
                }
                if (pMax > 0) {
                    markLines.push({ xAxis: horizontal ? undefined : pMax, yAxis: horizontal ? pMax : undefined, lineStyle: { color, width: 2, type: 'dashed' }, label: { show: false }, tooltip: { show: false } });
                }
            };

            if (showSD0_25) addSD(regions.sd0_25[0], regions.sd0_25[1], '#ec4899', 'dashed');
            if (showSD0_5) addSD(regions.sd0_5[0], regions.sd0_5[1], '#06b6d4', 'dashed');
            if (showSD1) addSD(regions.sd1[0], regions.sd1[1], '#10b981', 'dashed');
            if (showSD2) addSD(regions.sd2[0], regions.sd2[1], '#f59e0b', 'dashed');
            if (showSD3) addSD(regions.sd3[0], regions.sd3[1], '#ef4444', 'dashed');
        }

        const series: any[] = groupBy === 'stacked'
            ? [{
                name: 'Total Volume',
                type: 'bar',
                data: sortedData.map(d => d.long_volume + d.short_volume),
                itemStyle: { color: '#3b82f6', borderRadius: [0, 4, 4, 0] },
                markLine: markLines.length > 0 ? {
                    symbol: ['none', 'none'],
                    data: markLines,
                    animation: false
                } : undefined
            }]
            : [
                {
                    name: 'Longs',
                    type: 'bar',
                    data: sortedData.map(d => d.long_volume),
                    itemStyle: { color: '#10b981', borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
                    stack: groupBy === 'combined' ? 'total' : undefined,
                    markLine: markLines.length > 0 ? {
                        symbol: ['none', 'none'],
                        data: markLines,
                        silent: true,
                        animation: false
                    } : undefined
                },
                {
                    name: 'Shorts',
                    type: 'bar',
                    data: sortedData.map(d => d.short_volume),
                    itemStyle: { color: '#ef4444', borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
                    stack: groupBy === 'combined' ? 'total' : undefined
                }
            ];

        const savedStart = localStorage.getItem(zoomKeys.start);
        const savedEnd = localStorage.getItem(zoomKeys.end);

        const categoryAxis = {
            type: 'category',
            data: labels,
            inverse: horizontal,
            axisLabel: {
                color: '#64748b',
                formatter: (val: string) => formatCurrency(Number(val))
            },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false }
        };

        const valueAxis = {
            type: 'value',
            min: 0,
            max: yMax,
            axisLabel: {
                color: '#64748b',
                formatter: (val: number) => formatCurrency(val)
            },
            splitLine: { show: false }
        };

        return {
            grid: {
                top: 40,
                right: 20,
                bottom: 20,
                left: 60,
                containLabel: true
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross',
                    label: {
                        backgroundColor: '#1e293b',
                        color: '#f1f5f9',
                        formatter: (params: any) => {
                            if (params.axisDimension === (horizontal ? 'y' : 'x')) {
                                return formatCurrency(Number(params.value));
                            }
                            return params.value.toLocaleString();
                        }
                    }
                },
                backgroundColor: '#1e293b',
                borderColor: 'rgba(71, 85, 105, 0.2)',
                borderWidth: 1,
                padding: 12,
                textStyle: {
                    color: '#f8fafc',
                    fontFamily: 'Inter, sans-serif'
                },
                formatter: (params: any) => {
                    const dataIndex = params[0].dataIndex;
                    const d = sortedData[dataIndex];
                    if (!d) return '';

                    const title = (priceInterval > 0 || d.timestamp < 1000000000)
                        ? `Range: ${formatCurrency(d.timestamp)} - ${formatCurrency(d.timestamp + priceInterval)}`
                        : `Price: ${formatCurrency(d.price)} | ${new Date(d.timestamp * 1000).toLocaleDateString()}`;

                    const total = d.long_volume + d.short_volume;
                    let innerHtml = `
                        <div style="min-width: 200px;">
                            <div style="font-size: 13px; font-weight: 600; color: #f8fafc; margin-bottom: 8px;">${title}</div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
                                <span style="color: #10b981; font-weight: 600;">▲ Longs:</span> 
                                <span>${formatTooltipVolume(d.long_volume, d.price)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                                <span style="color: #ef4444; font-weight: 600;">▼ Shorts:</span> 
                                <span>${formatTooltipVolume(d.short_volume, d.price)}</span>
                            </div>
                            <div style="margin: 8px 0; border-top: 1px solid rgba(71, 85, 105, 0.4);"></div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
                                <span style="color: #94a3b8;">TOTAL LIQ:</span> 
                                <strong style="color: #3b82f6;">${formatTooltipVolume(total, d.price)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 13px;">
                                <span style="color: #94a3b8;">L/S RATIO:</span> 
                                <strong>${d.long_short_ratio.toFixed(2)}</strong>
                            </div>
                    `;

                    if (d.symbolVolumes && Object.keys(d.symbolVolumes).length > 1) {
                        innerHtml += `<div style="margin: 12px 0 6px 0; font-weight: 800; font-size: 10px; color: #64748b; text-transform: uppercase;">Detalhamento:</div>`;

                        Object.entries(d.symbolVolumes)
                            .sort(([, a]: any, [, b]: any) => (b.long + b.short) - (a.long + a.short))
                            .forEach(([symbol, vol]: [string, any]) => {
                                const assetTotal = vol.long + vol.short;
                                if (assetTotal > 0) {
                                    const sName = symbol.split('USDT')[0].replace('_PERP.A', '');
                                    const share = ((assetTotal / total) * 100).toFixed(0);

                                    innerHtml += `
                                        <div style="margin-top: 8px; border-left: 2px solid rgba(59, 130, 246, 0.4); padding-left: 10px;">
                                            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 2px;">
                                                <span style="font-weight: 700;">${sName}</span> 
                                                <span style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 1px 4px; border-radius: 4px;">${share}%</span>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; font-size: 12px; opacity: 0.8; margin-bottom: 2px;">
                                                <span>Total:</span> 
                                                <span>${formatTooltipVolume(assetTotal, d.price)}</span>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; font-size: 10px;">
                                                <span style="color: #34d399;">▲ ${formatTooltipVolume(vol.long, d.price)}</span>
                                                <span style="color: #f87171;">▼ ${formatTooltipVolume(vol.short, d.price)}</span>
                                            </div>
                                        </div>`;
                                }
                            });
                    }
                    innerHtml += '</div>';
                    return innerHtml;
                }
            },
            legend: {
                show: groupBy !== 'stacked',
                top: 0,
                textStyle: { color: '#64748b' },
                icon: 'circle'
            },
            xAxis: horizontal ? valueAxis : categoryAxis,
            yAxis: horizontal ? categoryAxis : valueAxis,
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: horizontal ? undefined : 0,
                    yAxisIndex: horizontal ? 0 : undefined,
                    start: savedStart ? Number(savedStart) : 0,
                    end: savedEnd ? Number(savedEnd) : 100
                }
            ],
            series
        };
    }, [horizontal, groupBy, labels, sortedData, priceInterval, formatCurrency, formatTooltipVolume, lineStyles, stdDevData, showMeanLine, showSD0_25, showSD0_5, showSD1, showSD2, showSD3, yMax, zoomKeys, currentPrice, gridLineInterval]);

    const onEvents = useMemo(() => ({
        datazoom: (params: any) => {
            if (chartRef.current) {
                const chart = chartRef.current.getEchartsInstance();
                const option = chart.getOption() as any;
                const start = option.dataZoom[0].start;
                const end = option.dataZoom[0].end;
                localStorage.setItem(zoomKeys.start, start.toString());
                localStorage.setItem(zoomKeys.end, end.toString());
            }
        }
    }), [zoomKeys]);

    return (
        <div className="relative w-full h-full group/chart">
            <ReactECharts 
                ref={chartRef}
                option={option}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
                onEvents={onEvents}
            />
            <button
                onClick={resetZoom}
                className="absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-background/90 hover:bg-background text-foreground rounded-lg border border-border shadow-lg opacity-0 group-hover/chart:opacity-100 transition-all z-20 backdrop-blur-sm"
                title="Reset Zoom & Pan"
            >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Zoom
            </button>
        </div>
    );
"""

content = content[:start_index] + new_component + content[end_index:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated successfully")
