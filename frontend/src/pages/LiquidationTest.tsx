import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import {
    RefreshCw,
    BarChart3,
    Calendar,
    Settings as SettingsIcon,
    Activity,
    DollarSign,
    TrendingUp,
    TrendingDown,
    Clock,
    Download,
    Upload,
    RotateCcw,
    ChevronDown,
    ChevronRight,
    Search
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useCacheData } from '@/hooks/useCacheData';
import { dbCache } from '@/utils/db';
import { useWebSocket } from '@/hooks/useWebSocket';
import { format } from 'date-fns';
import { liquidationsApi, pricesApi } from '@/services/api';
import { exportToCSV, exportToJSON, importFromCSV, importFromJSON, generateExportFilename } from '@/utils/exportImport';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface HistoricalLiquidation {
    timestamp: number;
    long_volume: number;
    short_volume: number;
    total_volume: number;
    long_short_ratio: number;
    price: number;
    symbol?: string; // Optional: used for multi-asset breakdown
    original_price?: number; // Price of the asset before normalization
    symbolVolumes?: Record<string, { long: number; short: number; avgOriginalPrice: number }>; // For aggregated data
}

// Liquidation Chart Component
// Line style configuration interface
export interface LineStyleConfig {
    color: string;
    width: number;
    dash?: number[];
}

// Chart line styles configuration
export interface ChartLineStyles {
    thousandLines: LineStyleConfig;
    btcQuoteLine: LineStyleConfig;
}

// Default line styles
export const defaultLineStyles: ChartLineStyles = {
    thousandLines: {
        color: '#fbff00',
        width: 1,
        dash: [],
    },
    btcQuoteLine: {
        color: '#ff0000',
        width: 3,
        dash: [5, 5],
    },
};

interface LiquidationChartProps {
    data: HistoricalLiquidation[];
    formatCurrency: (value: number) => string;
    groupBy?: 'none' | 'long' | 'short' | 'combined' | 'stacked';
    currentPrice?: number | null;
    priceInterval: number;
    lineStyles?: ChartLineStyles;
    gridLineInterval?: number;
    stdDevData?: {
        mean: number;
        stdDev: number;
        regions: { sd0_25: [number, number]; sd0_5: [number, number]; sd1: [number, number]; sd2: [number, number]; sd3: [number, number] };
    } | null;
    showMeanLine?: boolean;
    showSD0_25?: boolean;
    showSD0_5?: boolean;
    showSD1?: boolean;
    showSD2?: boolean;
    showSD3?: boolean;
    horizontal?: boolean;
    symbol: string;
    tooltipCurrency: 'usd' | 'btc';
}

const LiquidationChart = memo(function LiquidationChart({
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
    const containerRef = useRef<HTMLDivElement>(null);
    const [clickedIndex, setClickedIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);
    const [isInteracting, setIsInteracting] = useState(false);

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

    // Handle click outside to close sticky tooltip
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (clickedIndex !== null && containerRef.current) {
                // If the click target is NOT within our component's container
                if (!containerRef.current.contains(event.target as Node)) {
                    setClickedIndex(null);
                }
            }
        };

        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [clickedIndex]);

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

    const [brushedVolumes, setBrushedVolumes] = useState<{ long: number; short: number; total: number } | null>(null);

    const option: EChartsOption = useMemo(() => {
        const markLines: any[] = [];

        // Helper function to find the closest label index for category axis
        // OPTIMIZATION: Pre-compute price -> index Map for O(1) lookup instead of O(n) linear search
        const epsilon = 0.001; // Small tolerance for price comparison
        const priceIndexMap = new Map<number, number>();
        labels.forEach((price, idx) => {
            const key = Math.round(price / epsilon);
            // Keep the first occurrence for duplicate keys
            if (!priceIndexMap.has(key)) {
                priceIndexMap.set(key, idx);
            }
        });

        const findClosestLabelIndex = (target: number): number => {
            if (labels.length === 0) return 0;

            // Try O(1) lookup first
            const targetKey = Math.round(target / epsilon);
            if (priceIndexMap.has(targetKey)) {
                return priceIndexMap.get(targetKey)!;
            }

            // Fallback to binary search for closest match
            let left = 0;
            let right = labels.length - 1;
            let closestIdx = 0;
            let minDiff = Math.abs(labels[0] - target);

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const diff = Math.abs(labels[mid] - target);

                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = mid;
                }

                if (labels[mid] < target) {
                    left = mid + 1;
                } else if (labels[mid] > target) {
                    right = mid - 1;
                } else {
                    // Exact match found
                    return mid;
                }
            }

            // Check neighbors for potentially closer match
            if (closestIdx > 0) {
                const leftDiff = Math.abs(labels[closestIdx - 1] - target);
                if (leftDiff < minDiff) {
                    closestIdx = closestIdx - 1;
                    minDiff = leftDiff;
                }
            }
            if (closestIdx < labels.length - 1) {
                const rightDiff = Math.abs(labels[closestIdx + 1] - target);
                if (rightDiff < minDiff) {
                    closestIdx = closestIdx + 1;
                }
            }

            return closestIdx;
        };

        // Ensure minimum grid line interval to avoid infinite loops or no lines
        const effectiveGridInterval = Math.max(gridLineInterval, 100);

        // Grid Lines
        if (effectiveGridInterval > 0 && sortedData.length > 0) {
            const minP = sortedData[0].price;
            const maxP = sortedData[sortedData.length - 1].price;
            const first = Math.ceil(minP / effectiveGridInterval) * effectiveGridInterval;
            const last = Math.floor(maxP / effectiveGridInterval) * effectiveGridInterval;

            for (let m = first; m <= last; m += effectiveGridInterval) {
                // Use category index instead of string value for reliable positioning
                const idx = findClosestLabelIndex(m);
                markLines.push({
                    xAxis: horizontal ? undefined : idx,
                    yAxis: horizontal ? idx : undefined,
                    lineStyle: {
                        color: lineStyles.thousandLines.color,
                        width: lineStyles.thousandLines.width,
                        type: 'solid',
                    },
                    label: { show: false },
                    tooltip: { show: false }
                });
            }
        }

        // Current Price Line with fallback to middle price if API fails
        const effectiveCurrentPrice = currentPrice ?? (sortedData.length > 0
            ? (sortedData[0].price + sortedData[sortedData.length - 1].price) / 2
            : null);

        if (effectiveCurrentPrice !== null) {
            // Use category index instead of string value for reliable positioning
            const idx = findClosestLabelIndex(effectiveCurrentPrice);
            markLines.push({
                xAxis: horizontal ? undefined : idx,
                yAxis: horizontal ? idx : undefined,
                lineStyle: {
                    color: lineStyles.btcQuoteLine.color,
                    width: lineStyles.btcQuoteLine.width,
                    type: 'dashed',
                },
                label: { show: false },
                tooltip: { show: false }
            });
        }

        // Standard Deviations Lines & Areas
        const markAreas: any[] = [];
        if (stdDevData && sortedData.length > 0) {
            const { mean, regions } = stdDevData;

            if (showMeanLine) {
                const meanIdx = findClosestLabelIndex(mean);
                markLines.push({
                    xAxis: horizontal ? undefined : meanIdx,
                    yAxis: horizontal ? meanIdx : undefined,
                    lineStyle: { color: '#8b5cf6', width: 2, type: 'solid' },
                    label: { show: false },
                    tooltip: { show: false }
                });
            }

            const addSD = (pMin: number, pMax: number, color: string, opacity: number = 0.05) => {
                if (pMin > 0 && pMax > 0) {
                    // Lines - use category index instead of string value
                    const pMinIdx = findClosestLabelIndex(pMin);
                    const pMaxIdx = findClosestLabelIndex(pMax);
                    markLines.push({ xAxis: horizontal ? undefined : pMinIdx, yAxis: horizontal ? pMinIdx : undefined, lineStyle: { color, width: 1.5, type: 'dashed' }, label: { show: false }, tooltip: { show: false } });
                    markLines.push({ xAxis: horizontal ? undefined : pMaxIdx, yAxis: horizontal ? pMaxIdx : undefined, lineStyle: { color, width: 1.5, type: 'dashed' }, label: { show: false }, tooltip: { show: false } });

                    // Areas - use category index instead of string value
                    markAreas.push([{
                        name: 'SD Zone',
                        xAxis: horizontal ? undefined : pMinIdx,
                        yAxis: horizontal ? pMinIdx : undefined,
                        itemStyle: { color, opacity }
                    }, {
                        xAxis: horizontal ? undefined : pMaxIdx,
                        yAxis: horizontal ? pMaxIdx : undefined,
                    }]);
                }
            };

            if (showSD0_25) addSD(regions.sd0_25[0], regions.sd0_25[1], '#ec4899', 0.08);
            if (showSD0_5) addSD(regions.sd0_5[0], regions.sd0_5[1], '#06b6d4', 0.07);
            if (showSD1) addSD(regions.sd1[0], regions.sd1[1], '#10b981', 0.06);
            if (showSD2) addSD(regions.sd2[0], regions.sd2[1], '#f59e0b', 0.05);
            if (showSD3) addSD(regions.sd3[0], regions.sd3[1], '#ef4444', 0.04);
        }

        const series: any[] = groupBy === 'stacked'
            ? [{
                name: 'Total Volume',
                type: 'bar',
                data: sortedData.map(d => d.long_volume + d.short_volume),
                barWidth: '40%',
                barCategoryGap: '40%',
                itemStyle: {
                    color: '#3b82f6',
                    borderRadius: horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0],
                    borderWidth: 0
                },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 4,
                        shadowColor: 'rgba(59, 130, 246, 0.4)'
                    }
                },
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
                    barWidth: '40%',
                    barGap: '10%',
                    itemStyle: {
                        color: '#10b981',
                        borderRadius: horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0],
                        borderWidth: 0
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 4,
                            shadowColor: 'rgba(16, 185, 129, 0.4)'
                        }
                    },
                    stack: groupBy === 'combined' ? 'total' : undefined,
                    markLine: markLines.length > 0 ? {
                        symbol: ['none', 'none'],
                        data: markLines,
                        silent: true,
                        animation: false
                    } : undefined,
                    markArea: markAreas.length > 0 ? {
                        silent: true,
                        data: markAreas,
                        animation: false
                    } : undefined
                },
                {
                    name: 'Shorts',
                    type: 'bar',
                    data: sortedData.map(d => d.short_volume),
                    barWidth: '40%',
                    barGap: '10%',
                    itemStyle: {
                        color: '#ef4444',
                        borderRadius: horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0],
                        borderWidth: 0
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 4,
                            shadowColor: 'rgba(239, 68, 68, 0.4)'
                        }
                    },
                    stack: groupBy === 'combined' ? 'total' : undefined,
                    markLine: markLines.length > 0 ? {
                        symbol: ['none', 'none'],
                        data: markLines,
                        silent: true,
                        animation: false
                    } : undefined,
                    markArea: markAreas.length > 0 ? {
                        silent: true,
                        data: markAreas,
                        animation: false
                    } : undefined
                }
            ];

        const savedStart = localStorage.getItem(zoomKeys.start);
        const savedEnd = localStorage.getItem(zoomKeys.end);

        // Create a lookup for price -> volume data
        const priceDataMap = new Map(
            sortedData
                .filter(d => d.long_volume + d.short_volume > 0)
                .map(d => [String(d.price), d])
        );

        const categoryAxis = {
            type: 'category' as const,
            data: labels.map(String),
            inverse: !horizontal,
            axisLabel: {
                fontSize: 10,
                fontWeight: 500,
                interval: 0,
                formatter: (val: string) => {
                    const data = priceDataMap.get(val);
                    if (!data) return '';
                    
                    // Determine color based on predominance
                    const isLongPredominant = data.long_volume > data.short_volume;
                    const color = isLongPredominant ? '#10b981' : '#ef4444';
                    
                    // Return rich text with color
                    return `{${isLongPredominant ? 'long' : 'short'}|${formatCurrency(Number(val))}}`;
                },
                rich: {
                    long: {
                        color: '#10b981',
                        fontSize: 10,
                        fontWeight: 600
                    },
                    short: {
                        color: '#ef4444',
                        fontSize: 10,
                        fontWeight: 600
                    }
                }
            },
            axisLine: { show: true, lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } },
            axisTick: {
                show: true,
                lineStyle: { color: 'rgba(100, 116, 139, 0.2)' },
                interval: (index: number) => priceDataMap.has(String(labels[index]))
            },
            splitLine: { show: false }
        };

        const valueAxis = {
            type: 'value' as const,
            min: 0,
            max: yMax,
            axisLabel: {
                color: '#94a3b8',
                fontSize: 11,
                fontWeight: 500,
                formatter: (val: number) => formatCurrency(val)
            },
            axisLine: { show: true, lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } },
            axisTick: { show: true, lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } },
            splitLine: {
                show: true,
                lineStyle: {
                    color: 'rgba(100, 116, 139, 0.1)',
                    type: 'dashed'
                }
            }
        };

        return {
            grid: {
                top: 40,
                right: 20,
                bottom: 20,
                left: horizontal ? 90 : 60,
                containLabel: true
            },
            tooltip: {
                show: !isInteracting,
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
                        <div style="min-width: 220px; font-family: 'Inter', sans-serif; background: #1e293b; color: #f1f5f9; padding: 2px;">
                            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.1); padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">${title}</div>
                            
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <span style="color: #10b981; font-weight: 600; font-size: 13px;">▲ Longs:</span> 
                                <span style="font-weight: 700; font-size: 13px;">${formatTooltipVolume(d.long_volume, d.price)}</span>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <span style="color: #ef4444; font-weight: 600; font-size: 13px;">▼ Shorts:</span> 
                                <span style="font-weight: 700; font-size: 13px;">${formatTooltipVolume(d.short_volume, d.price)}</span>
                            </div>

                            <div style="background: rgba(15, 23, 42, 0.5); border-radius: 6px; padding: 10px; margin-top: 10px; border: 1px solid rgba(148, 163, 184, 0.1);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span style="color: #94a3b8; font-size: 11px; font-weight: 600;">TOTAL LIQ:</span> 
                                    <strong style="color: #3b82f6; font-size: 13px;">${formatTooltipVolume(total, d.price)}</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #94a3b8; font-size: 11px; font-weight: 600;">L/S RATIO:</span> 
                                    <strong style="color: #f1f5f9; font-size: 13px;">${d.long_short_ratio.toFixed(2)}</strong>
                                </div>
                            </div>
                    `;

                    if (d.symbolVolumes && Object.keys(d.symbolVolumes).length > 1) {
                        innerHtml += `<div style="margin: 15px 0 8px 0; font-weight: 800; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">Detalhamento de Ativos</div>`;
                        innerHtml += `<div class="tooltip-scroll-container" style="max-height: 200px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.3) transparent;">`;

                        Object.entries(d.symbolVolumes)
                            .sort(([, a]: any, [, b]: any) => (b.long + b.short) - (a.long + a.short))
                            .forEach(([symbol, vol]: [string, any]) => {
                                const assetTotal = vol.long + vol.short;
                                if (assetTotal > 0) {
                                    const sName = symbol.split('USDT')[0].replace('_PERP.A', '');
                                    const share = ((assetTotal / total) * 100).toFixed(0);

                                    innerHtml += `
                                        <div style="margin-bottom: 10px; border-left: 3px solid rgba(59, 130, 246, 0.5); padding-left: 12px;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                                                <span style="font-weight: 700; color: #f1f5f9; font-size: 12px;">${sName}</span> 
                                                <span style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${share}%</span>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 4px;">
                                                <span>Volume:</span> 
                                                <span style="color: #cbd5e1; font-weight: 600;">${formatTooltipVolume(assetTotal, d.price)}</span>
                                            </div>
                                            <div style="display: flex; gap: 8px; font-size: 10px;">
                                                <span style="color: #34d399; background: rgba(52, 211, 153, 0.1); padding: 1px 4px; border-radius: 3px;">▲ ${formatTooltipVolume(vol.long, d.price)}</span>
                                                <span style="color: #f87171; background: rgba(248, 113, 113, 0.1); padding: 1px 4px; border-radius: 3px;">▼ ${formatTooltipVolume(vol.short, d.price)}</span>
                                            </div>
                                        </div>`;
                                }
                            });
                        innerHtml += `</div>`;
                    }
                    innerHtml += '</div>';
                    return innerHtml;
                }
            },
            legend: {
                show: groupBy !== 'stacked',
                top: 0,
                left: 'center',
                textStyle: { color: '#64748b' },
                icon: 'circle'
            },
            toolbox: {
                show: true,
                right: 20,
                top: 0,
                feature: {
                    brush: {
                        type: ['rect', 'clear'],
                        title: { rect: 'Seleção', clear: 'Limpar Seleção' }
                    },
                    dataView: { show: true, readOnly: true, title: 'Ver Dados', lang: ['Visualização de Dados', 'Fechar', 'Atualizar'] },
                    saveAsImage: { show: true, title: 'Salvar Imagem', type: 'png' },
                    restore: { show: true, title: 'Reset' }
                },
                iconStyle: {
                    borderColor: '#64748b'
                }
            },
            brush: {
                toolbox: ['rect', 'clear'],
                xAxisIndex: horizontal ? undefined : 0,
                yAxisIndex: horizontal ? 0 : undefined,
                brushStyle: {
                    borderWidth: 1,
                    color: 'rgba(59, 130, 246, 0.2)',
                    borderColor: 'rgba(59, 130, 246, 0.5)'
                }
            },
            visualMap: {
                show: false, // Keep it internal for color calculation without showing the legend
                min: 0,
                max: yMax,
                dimension: horizontal ? 0 : 1, // Use volume dimension
                inRange: {
                    colorAlpha: [0.7, 1] // Subtle alpha increase for higher volumes
                }
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
                },
                {
                    type: 'slider',
                    show: true,
                    xAxisIndex: horizontal ? undefined : 0,
                    yAxisIndex: horizontal ? 0 : undefined,
                    bottom: 0,
                    height: 20,
                    borderColor: 'transparent',
                    fillerColor: 'rgba(59, 130, 246, 0.1)',
                    handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
                    handleSize: '80%',
                    handleStyle: {
                        color: '#3b82f6',
                        shadowBlur: 3,
                        shadowColor: 'rgba(0, 0, 0, 0.6)',
                        shadowOffsetX: 2,
                        shadowOffsetY: 2
                    },
                    textStyle: { color: '#64748b' },
                    start: savedStart ? Number(savedStart) : 0,
                    end: savedEnd ? Number(savedEnd) : 100
                }
            ],
            series
        };
    }, [horizontal, groupBy, labels, sortedData, priceInterval, formatCurrency, formatTooltipVolume, lineStyles, stdDevData, showMeanLine, showSD0_25, showSD0_5, showSD1, showSD2, showSD3, yMax, zoomKeys, currentPrice, gridLineInterval, isInteracting]);

    const onEvents = useMemo(() => ({
        datazoom: (params: any) => {
            // Mark interaction as complete when datazoom finishes
            setTimeout(() => setIsInteracting(false), 100);
            
            if (chartRef.current) {
                const chart = chartRef.current.getEchartsInstance();
                const option = chart.getOption() as any;
                const start = option.dataZoom[0].start;
                const end = option.dataZoom[0].end;
                localStorage.setItem(zoomKeys.start, start.toString());
                localStorage.setItem(zoomKeys.end, end.toString());
            }
        },
        mousedown: () => {
            // User started interacting (potential pan/zoom)
            setIsInteracting(true);
        },
        mouseup: () => {
            // User finished interacting
            setIsInteracting(false);
        },
        click: (params: any) => {
            // Check if we clicked on a bar (Longs, Shorts, or Total Volume)
            if (params.componentType === 'series' && params.seriesType === 'bar') {
                const event = params.event.event;
                // Use offsetX/Y for positioning relative to the container
                setTooltipPos({ x: event.offsetX, y: event.offsetY });
                setClickedIndex(params.dataIndex);
            }
        },
        brushselected: (params: any) => {
            const brushed = params.batch[0].selected;
            if (!brushed || brushed.length === 0) {
                setBrushedVolumes(null);
                return;
            }

            let longVol = 0;
            let shortVol = 0;

            brushed.forEach((s: any) => {
                if (s.dataIndex && s.dataIndex.length > 0) {
                    s.dataIndex.forEach((idx: number) => {
                        const d = sortedData[idx];
                        if (d) {
                            longVol += d.long_volume;
                            shortVol += d.short_volume;
                        }
                    });
                }
            });

            if (longVol > 0 || shortVol > 0) {
                setBrushedVolumes({ long: longVol, short: shortVol, total: longVol + shortVol });
            } else {
                setBrushedVolumes(null);
            }
        }
    }), [zoomKeys, sortedData]); // Added sortedData to deps to ensure correct index mapping

    const renderStickyTooltip = () => {
        if (clickedIndex === null || !tooltipPos) return null;
        const d = sortedData[clickedIndex];
        if (!d) return null;

        const title = (priceInterval > 0 || d.timestamp < 1000000000)
            ? `Range: ${formatCurrency(d.timestamp)} - ${formatCurrency(d.timestamp + priceInterval)}`
            : `Price: ${formatCurrency(d.price)} | ${new Date(d.timestamp * 1000).toLocaleDateString()}`;

        const total = d.long_volume + d.short_volume;

        return (
            <div
                className="absolute z-50 pointer-events-auto shadow-2xl border border-slate-700/50 rounded-lg overflow-hidden animate-in fade-in zoom-in duration-200"
                style={{
                    left: tooltipPos.x + 10,
                    top: Math.max(10, tooltipPos.y - 100),
                    backgroundColor: '#1e293b',
                    color: '#f1f5f9',
                    minWidth: '240px'
                }}
            >
                <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); setClickedIndex(null); }}
                        className="p-1 hover:bg-slate-800 rounded-md transition-colors"
                    >
                        <RefreshCw className="h-3 w-3 rotate-45 text-slate-400" />
                    </button>
                </div>

                <div className="p-3">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-emerald-500 font-semibold text-xs">▲ Longs</span>
                        <span className="font-bold text-sm">{formatTooltipVolume(d.long_volume, d.price)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-red-500 font-semibold text-xs">▼ Shorts</span>
                        <span className="font-bold text-sm">{formatTooltipVolume(d.short_volume, d.price)}</span>
                    </div>

                    <div className="bg-slate-950/40 rounded-md p-2.5 border border-slate-800/50">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-slate-400 text-[10px] font-bold">TOTAL LIQ</span>
                            <span className="text-blue-400 font-bold text-xs">{formatTooltipVolume(total, d.price)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-[10px] font-bold">L/S RATIO</span>
                            <span className="text-slate-200 font-bold text-xs">{d.long_short_ratio.toFixed(2)}</span>
                        </div>
                    </div>

                    {d.symbolVolumes && Object.keys(d.symbolVolumes).length > 1 && (
                        <>
                            <div className="mt-4 mb-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Detalhamento</div>
                            <div className="max-height-[180px] overflow-y-auto pr-1 custom-scrollbar" style={{ maxHeight: '180px' }}>
                                {Object.entries(d.symbolVolumes)
                                    .sort(([, a]: any, [, b]: any) => (b.long + b.short) - (a.long + a.short))
                                    .map(([sSymbol, vol]: [string, any]) => {
                                        const assetTotal = vol.long + vol.short;
                                        if (assetTotal === 0) return null;
                                        const sName = sSymbol.split('USDT')[0].replace('_PERP.A', '');
                                        const share = ((assetTotal / total) * 100).toFixed(0);
                                        return (
                                            <div key={sSymbol} className="mb-2.5 border-l-2 border-blue-500/30 pl-2.5">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-bold text-xs">{sName}</span>
                                                    <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-bold">{share}%</span>
                                                </div>
                                                <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                                                    <span>Vol:</span>
                                                    <span className="text-slate-300 font-medium">{formatTooltipVolume(assetTotal, d.price)}</span>
                                                </div>
                                                <div className="flex gap-2 text-[9px]">
                                                    <span className="text-emerald-400/80">▲ {formatTooltipVolume(vol.long, d.price)}</span>
                                                    <span className="text-red-400/80">▼ {formatTooltipVolume(vol.short, d.price)}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full group/chart overflow-hidden"
            onClick={(e) => {
                // Only close if clicking the background, not the tooltip or chart elements
                if (e.target === e.currentTarget) {
                    setClickedIndex(null);
                }
            }}
        >
            <ReactECharts
                ref={chartRef}
                option={option}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
                onEvents={onEvents}
            />
            {renderStickyTooltip()}

            {/* Brush Volume Indicator */}
            {brushedVolumes && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-900/90 border border-blue-500/50 rounded-full shadow-2xl backdrop-blur-md z-30 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-4 text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                            <TrendingUp className="h-3 w-3" />
                            {formatTooltipVolume(brushedVolumes.long, (sortedData[0]?.price || 0))}
                        </span>
                        <div className="w-px h-3 bg-slate-700"></div>
                        <span className="flex items-center gap-1.5 text-red-400">
                            <TrendingDown className="h-3 w-3" />
                            {formatTooltipVolume(brushedVolumes.short, (sortedData[0]?.price || 0))}
                        </span>
                        <div className="w-px h-3 bg-slate-700"></div>
                        <span className="flex items-center gap-1.5 text-blue-400">
                            Vol: {formatTooltipVolume(brushedVolumes.total, (sortedData[0]?.price || 0))}
                        </span>
                    </div>
                </div>
            )}

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    resetZoom();
                }}
                className="absolute top-2 left-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-background/90 hover:bg-background text-foreground rounded-lg border border-border shadow-lg opacity-0 group-hover/chart:opacity-100 transition-all z-20 backdrop-blur-sm"
                title="Reset Zoom & Pan"
            >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Zoom
            </button>
        </div>
    );
});

export function LiquidationTest() {
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('coinalyze_api_key') || 'FREE');
    const [isMultiAssetMode, setIsMultiAssetMode] = useState(() => localStorage.getItem('liquidation_test_multi_asset') === 'true');
    const [symbol, setSymbol] = useState(() => localStorage.getItem('liquidation_test_symbol') || 'BTCUSDT_PERP.A');
    const [selectedSymbols, setSelectedSymbols] = useState<string[]>(() => {
        const saved = localStorage.getItem('liquidation_test_selected_symbols');
        return saved ? JSON.parse(saved) : ['BTCUSDT_PERP.A'];
    });
    const [months, setMonths] = useState(() => Number(localStorage.getItem('liquidation_test_months')) || 36);
    const [priceInterval, setPriceInterval] = useState(() => Number(localStorage.getItem('liquidation_test_price_interval')) || 20);
    const [amountMin, setAmountMin] = useState<string>(() => localStorage.getItem('liquidation_test_amount_min') || '200');
    const [amountMax, setAmountMax] = useState<string>(() => localStorage.getItem('liquidation_test_amount_max') || '');
    const [side, setSide] = useState<'all' | 'long' | 'short'>(() => (localStorage.getItem('liquidation_test_side') as 'all' | 'long' | 'short') || 'all');
    const [groupBy, setGroupBy] = useState<'none' | 'long' | 'short' | 'combined' | 'stacked'>(() => (localStorage.getItem('liquidation_test_group_by') as 'none' | 'long' | 'short' | 'combined' | 'stacked') || 'combined');
    const [chartHorizontal, setChartHorizontal] = useState(() => localStorage.getItem('liquidation_test_chart_horizontal') === 'true');
    const [chartHeight, setChartHeight] = useState(() => Number(localStorage.getItem('liquidation_test_chart_height')) || 400);
    const [previewHeight, setPreviewHeight] = useState(chartHeight);
    const [isResizing, setIsResizing] = useState(false);
    const [ratioFilter, setRatioFilter] = useState<string>(() => localStorage.getItem('liquidation_test_ratio_filter') || '0');
    const [ratioFilterMax, setRatioFilterMax] = useState<string>(() => localStorage.getItem('liquidation_test_ratio_filter_max') || '100');
    const [priceRangeMin, setPriceRangeMin] = useState<string>(() => localStorage.getItem('liquidation_test_price_range_min') || '55000');
    const [priceRangeMax, setPriceRangeMax] = useState<string>(() => localStorage.getItem('liquidation_test_price_range_max') || '80000');
    const [tooltipCurrency, setTooltipCurrency] = useState<'usd' | 'btc'>(() => (localStorage.getItem('liquidation_test_tooltip_currency') as 'usd' | 'btc') || 'usd');
    const [priceRefreshInterval, setPriceRefreshInterval] = useState(() => Number(localStorage.getItem('liquidation_test_price_refresh')) || 5);
    const [gridLineInterval, setGridLineInterval] = useState(() => Number(localStorage.getItem('liquidation_test_grid_line_interval')) || 1000);
    const [smartIntervalEnabled, setSmartIntervalEnabled] = useState(() => localStorage.getItem('liquidation_test_smart_interval_enabled') === 'true');
    const [fixedIntervalCount, setFixedIntervalCount] = useState(() => Number(localStorage.getItem('liquidation_test_fixed_interval_count')) || 50);
    const [useFixedIntervalCount, setUseFixedIntervalCount] = useState(() => localStorage.getItem('liquidation_test_use_fixed_interval_count') === 'true');
    const [adaptiveScope, setAdaptiveScope] = useState<'complete' | 'range'>(() => {
        const saved = localStorage.getItem('liquidation_test_adaptive_scope');
        return saved === 'range' ? 'range' : 'complete';
    });
    // Normal Distribution Analysis State
    const [normalDistributionEnabled, setNormalDistributionEnabled] = useState(() => localStorage.getItem('liquidation_test_normal_distribution_enabled') === 'true');
    const [stdDevData, setStdDevData] = useState<{
        mean: number;
        stdDev: number;
        regions: { sd0_25: [number, number]; sd0_5: [number, number]; sd1: [number, number]; sd2: [number, number]; sd3: [number, number] };
    } | null>(null);
    // Individual deviation display toggles
    const [showMeanLine, setShowMeanLine] = useState(() => localStorage.getItem('liquidation_test_show_mean') !== 'false');
    const [showSD0_25, setShowSD0_25] = useState(() => localStorage.getItem('liquidation_test_show_sd0_25') === 'true');
    const [showSD0_5, setShowSD0_5] = useState(() => localStorage.getItem('liquidation_test_show_sd0_5') === 'true');
    const [showSD1, setShowSD1] = useState(() => localStorage.getItem('liquidation_test_show_sd1') !== 'false');
    const [showSD2, setShowSD2] = useState(() => localStorage.getItem('liquidation_test_show_sd2') !== 'false');
    const [showSD3, setShowSD3] = useState(() => localStorage.getItem('liquidation_test_show_sd3') !== 'false');
    // Normal distribution scope - 'complete' uses all data, 'range' uses only price range
    const [normalDistScope, setNormalDistScope] = useState<'complete' | 'range'>(() => {
        const saved = localStorage.getItem('liquidation_test_normal_dist_scope');
        return saved === 'range' ? 'range' : 'complete';
    });
    const [clusterDensity, setClusterDensity] = useState(() => {
        const saved = Number(localStorage.getItem('liquidation_test_cluster_density'));
        // Migrate old 1-10 values to 1-100 range, or use default 50
        if (saved && saved >= 1 && saved <= 10) {
            return Math.round(saved * 10);
        }
        return saved && saved >= 1 && saved <= 100 ? saved : 50;
    });
    const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'loading' | null }>({ message: '', type: null });
    const [minInterval, setMinInterval] = useState(() => Number(localStorage.getItem('liquidation_test_min_interval')) || 1);
    const [maxInterval, setMaxInterval] = useState(() => Number(localStorage.getItem('liquidation_test_max_interval')) || 10000);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [availableSymbols, setAvailableSymbols] = useState<{ symbol: string; name: string; baseAsset: string; rank?: number; marketCap?: number; category: 'Perpetual' | 'Futures' | 'Spot' }[]>([]);
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [symbolSearch, setSymbolSearch] = useState('');
    const [isSymbolOpen, setIsSymbolOpen] = useState(false);
    const symbolRef = useRef<HTMLDivElement>(null);
    // Line styles state with localStorage persistence
    const [lineStyles, setLineStyles] = useState<ChartLineStyles>(() => {
        const saved = localStorage.getItem('liquidation_test_line_styles');
        if (saved) {
            try {
                return { ...defaultLineStyles, ...JSON.parse(saved) };
            } catch {
                return defaultLineStyles;
            }
        }
        return defaultLineStyles;
    });
    const [data, setData] = useState<HistoricalLiquidation[]>([]);
    const [processedData, setProcessedData] = useState<HistoricalLiquidation[]>([]);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
    const isFetchingPriceRef = useRef(false);

    // Estado para controlar fetch manual vs cache
    const [shouldFetchNewData, setShouldFetchNewData] = useState(false);
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
    const [cacheStatus, setCacheStatus] = useState<'idle' | 'loading_cache' | 'loaded_from_cache' | 'fetching_api' | 'loaded_from_api'>('idle');

    // Persist line styles to localStorage
    const { lastMessage } = useWebSocket();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // OPTIMIZED: Consolidated all localStorage persistence into a single useEffect
    // Reduces from 30+ individual effects to 1, preventing re-render cascade
    useEffect(() => {
        localStorage.setItem('liquidation_test_line_styles', JSON.stringify(lineStyles));
        localStorage.setItem('coinalyze_api_key', apiKey);
        localStorage.setItem('liquidation_test_multi_asset', String(isMultiAssetMode));
        localStorage.setItem('liquidation_test_symbol', symbol);
        localStorage.setItem('liquidation_test_selected_symbols', JSON.stringify(selectedSymbols));
        localStorage.setItem('liquidation_test_tooltip_currency', tooltipCurrency);
    }, [lineStyles, apiKey, isMultiAssetMode, symbol, selectedSymbols, tooltipCurrency]);

    // Fetch available symbols on mount
    useEffect(() => {
        const fetchSymbols = async () => {
            try {
                const symbols = await liquidationsApi.getSymbols();
                setAvailableSymbols(symbols);
            } catch (error) {
                console.error('Failed to fetch symbols:', error);
            }
        };
        fetchSymbols();
    }, []);

    // Close symbol dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (symbolRef.current && !symbolRef.current.contains(event.target as Node)) {
                setIsSymbolOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredSymbols = useMemo(() => {
        return availableSymbols.filter(s =>
            s.name.toLowerCase().includes(symbolSearch.toLowerCase()) ||
            s.symbol.toLowerCase().includes(symbolSearch.toLowerCase())
        );
    }, [availableSymbols, symbolSearch]);

    const currentSymbolData = useMemo(() => {
        return availableSymbols.find(s => s.symbol === symbol) || { symbol, name: symbol, baseAsset: symbol.split('USDT')[0] };
    }, [availableSymbols, symbol]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_months', String(months));
    }, [months]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_price_interval', String(priceInterval));
    }, [priceInterval]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_amount_min', amountMin);
    }, [amountMin]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_amount_max', amountMax);
    }, [amountMax]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_side', side);
    }, [side]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_group_by', groupBy);
    }, [groupBy]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_chart_horizontal', String(chartHorizontal));
    }, [chartHorizontal]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_chart_height', String(chartHeight));
    }, [chartHeight]);

    const handleChartResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = chartHeight;
        setIsResizing(true);
        setPreviewHeight(startHeight);

        let latestHeight = startHeight;

        const onMouseMove = (ev: MouseEvent) => {
            const delta = ev.clientY - startY;
            latestHeight = Math.max(200, Math.min(1200, startHeight + delta));
            setPreviewHeight(latestHeight);
        };

        const onMouseUp = () => {
            setIsResizing(false);
            setChartHeight(latestHeight);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [chartHeight]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_ratio_filter', ratioFilter);
    }, [ratioFilter]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_ratio_filter_max', ratioFilterMax);
    }, [ratioFilterMax]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_price_range_min', priceRangeMin);
    }, [priceRangeMin]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_price_range_max', priceRangeMax);
    }, [priceRangeMax]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_price_refresh', String(priceRefreshInterval));
    }, [priceRefreshInterval]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_grid_line_interval', String(gridLineInterval));
    }, [gridLineInterval]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_smart_interval_enabled', String(smartIntervalEnabled));
    }, [smartIntervalEnabled]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_fixed_interval_count', String(fixedIntervalCount));
    }, [fixedIntervalCount]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_use_fixed_interval_count', String(useFixedIntervalCount));
    }, [useFixedIntervalCount]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_adaptive_scope', adaptiveScope);
    }, [adaptiveScope]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_normal_distribution_enabled', String(normalDistributionEnabled));
    }, [normalDistributionEnabled]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_mean', String(showMeanLine));
    }, [showMeanLine]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd0_25', String(showSD0_25));
    }, [showSD0_25]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd0_5', String(showSD0_5));
    }, [showSD0_5]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd1', String(showSD1));
    }, [showSD1]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd2', String(showSD2));
    }, [showSD2]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_show_sd3', String(showSD3));
    }, [showSD3]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_normal_dist_scope', normalDistScope);
    }, [normalDistScope]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_cluster_density', String(clusterDensity));
    }, [clusterDensity]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_normal_distribution_enabled', String(normalDistributionEnabled));
    }, [normalDistributionEnabled]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_min_interval', String(minInterval));
    }, [minInterval]);

    useEffect(() => {
        localStorage.setItem('liquidation_test_max_interval', String(maxInterval));
    }, [maxInterval]);

    const handleExportCSV = () => {
        const exportSource = processedData.length > 0 ? processedData : data;
        if (exportSource.length === 0) {
            setStatus({ message: 'Nenhum dado para exportar', type: 'error' });
            return;
        }

        const filename = generateExportFilename(isMultiAssetMode ? 'MULTI' : symbol, 'csv');
        const exportData = exportSource.map(item => {
            const row: any = {
                data_formatada: format(new Date(item.timestamp * 1000), 'dd/MM/yyyy HH:mm:ss'),
                timestamp: item.timestamp,
                preco: item.price,
                volume_long: item.long_volume,
                volume_short: item.short_volume,
                volume_total: item.total_volume,
                ratio_ls: item.long_short_ratio.toFixed(2),
                ativo: item.symbol || (isMultiAssetMode ? 'MULTI' : symbol)
            };

            // Add breakdown if available (for aggregated rows)
            if (item.symbolVolumes) {
                row.detalhamento = Object.entries(item.symbolVolumes)
                    .map(([s, v]: [string, any]) => `${s}(L:${v.long.toFixed(0)},S:${v.short.toFixed(0)})`)
                    .join(' | ');
            }

            return row;
        });

        exportToCSV(exportData, filename);
        setStatus({ message: `Dados exportados para ${filename}`, type: 'success' });
    };

    const handleExportJSON = () => {
        // We export the raw mapped 'data' to allow perfect state restoration on import
        if (data.length === 0) {
            setStatus({ message: 'Nenhum dado para exportar', type: 'error' });
            return;
        }

        const filename = generateExportFilename(isMultiAssetMode ? 'MULTI' : symbol, 'json');
        const metadata = {
            symbol: isMultiAssetMode ? 'MULTI' : symbol,
            selectedSymbols: isMultiAssetMode ? selectedSymbols : [symbol],
            isMultiAssetMode,
            months,
            priceInterval,
            recordCount: data.length,
            exportedAt: new Date().toISOString(),
            // Store app versions or schema versions if needed
            schemaVersion: '2.0'
        };

        exportToJSON(data, metadata, filename);
        setStatus({ message: `Configurações e ${data.length} registros exportados para ${filename}`, type: 'success' });
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setStatus({ message: 'Importando dados...', type: 'loading' });

            let importedData: any[] = [];
            let metadata: any = null;

            if (file.name.endsWith('.json')) {
                const parsed = await importFromJSON(file);
                if (parsed.data && Array.isArray(parsed.data)) {
                    importedData = parsed.data;
                    metadata = parsed.metadata;
                } else if (Array.isArray(parsed)) {
                    importedData = parsed;
                } else {
                    throw new Error('Formato JSON inválido: esperado array de dados ou objeto {metadata, data}');
                }
            } else if (file.name.endsWith('.csv')) {
                importedData = await importFromCSV(file);
            } else {
                setStatus({ message: 'Formato de arquivo não suportado. Use CSV ou JSON.', type: 'error' });
                return;
            }

            if (importedData.length === 0) {
                setStatus({ message: 'Arquivo não contém dados válidos.', type: 'error' });
                return;
            }

            // Validation: Ensure required fields exist in at least the first record
            const first = importedData[0];
            const hasRequired = (first.timestamp !== undefined || first.timestamp_original !== undefined) &&
                (first.price !== undefined || first.preco !== undefined) &&
                (first.total_volume !== undefined || first.volume_total !== undefined || first.amount !== undefined);

            if (!hasRequired) {
                console.warn('Imported data might be missing required fields:', first);
            }

            // Sync state with metadata if available (Restore Session)
            if (metadata) {
                if (metadata.isMultiAssetMode !== undefined) setIsMultiAssetMode(metadata.isMultiAssetMode);
                if (metadata.selectedSymbols) setSelectedSymbols(metadata.selectedSymbols);
                if (metadata.symbol && !metadata.isMultiAssetMode) setSymbol(metadata.symbol);
                if (metadata.months) setMonths(metadata.months);
                if (metadata.priceInterval) setPriceInterval(metadata.priceInterval);
            }

            setData(importedData);
            setLastFetchTime(Date.now());
            setStatus({
                message: `Importação concluída: ${importedData.length} registros restaurados.${metadata ? ' (Configurações aplicadas)' : ''}`,
                type: 'success'
            });
        } catch (error: any) {
            console.error('Import error:', error);
            setStatus({ message: `Erro ao importar: ${error.message || 'Verifique o formato.'}`, type: 'error' });
        }

        event.target.value = '';
    };

    const formatCurrency = useCallback((value: number) => {
        return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }, []);

    // OPTIMIZED: Consolidated aggregation reducing from 6 passes to 3 passes O(n)
    const aggregateByPriceInterval = useCallback((rawData: HistoricalLiquidation[], interval: number) => {
        if (!interval || interval <= 0) {
            // Single pass O(n) for side filtering when no aggregation needed
            return rawData.map(item => {
                const long = side === 'short' ? 0 : item.long_volume;
                const short = side === 'long' ? 0 : item.short_volume;
                const total = long + short;
                return {
                    ...item,
                    long_volume: long,
                    short_volume: short,
                    total_volume: total,
                    long_short_ratio: long / (short || 1)
                };
            }).filter(item => side === 'all' || item.total_volume > 0);
        }

        const aggregated: Record<string, any> = {};
        let minRange = Infinity;
        let maxRange = -Infinity;

        // OPTIMIZED: Single pass O(n) combining side filter, min/max calc, and aggregation
        for (const item of rawData) {
            // Side filter applied inline
            const long = side === 'short' ? 0 : item.long_volume;
            const short = side === 'long' ? 0 : item.short_volume;
            const total = long + short;

            // Skip zero volume entries when side is specified
            if (side !== 'all' && total === 0) continue;

            const price = item.price || 0;
            const priceRange = Math.floor(price / interval) * interval;

            // Track min/max inline (pass 1)
            if (priceRange < minRange) minRange = priceRange;
            if (priceRange > maxRange) maxRange = priceRange;

            const safeR = Number(priceRange.toFixed(8));
            const safeREnd = Number((priceRange + interval).toFixed(8));
            const rangeKey = `${safeR}-${safeREnd}`;

            // Aggregate inline (combined with filter)
            if (!aggregated[rangeKey]) {
                aggregated[rangeKey] = {
                    priceRange: safeR,
                    priceRangeEnd: safeREnd,
                    long_volume: 0,
                    short_volume: 0,
                    total_volume: 0,
                    count: 0,
                    symbolVolumes: {}
                };
            }

            const agg = aggregated[rangeKey];
            agg.long_volume += long;
            agg.short_volume += short;
            agg.total_volume += total;
            agg.count += 1;

            if (item.symbol) {
                if (!agg.symbolVolumes[item.symbol]) {
                    agg.symbolVolumes[item.symbol] = { long: 0, short: 0, avgOriginalPrice: 0 };
                }
                const sv = agg.symbolVolumes[item.symbol];
                const oldTotal = sv.long + sv.short;
                sv.long += long;
                sv.short += short;
                const newTotal = sv.long + sv.short;

                if (newTotal > 0 && item.original_price) {
                    sv.avgOriginalPrice = ((sv.avgOriginalPrice * oldTotal) + (item.original_price * total)) / newTotal;
                }
            }
        }

        // Pass 2: Fill empty ranges (only if reasonable number of steps)
        if (minRange !== Infinity && maxRange !== -Infinity) {
            const steps = (maxRange - minRange) / interval;
            if (steps <= 50000) {
                for (let r = minRange; r <= maxRange; r += interval) {
                    const safeR = Number(r.toFixed(8));
                    const safeREnd = Number((r + interval).toFixed(8));
                    const rangeKey = `${safeR}-${safeREnd}`;
                    if (!aggregated[rangeKey]) {
                        aggregated[rangeKey] = {
                            priceRange: safeR,
                            priceRangeEnd: safeREnd,
                            long_volume: 0,
                            short_volume: 0,
                            total_volume: 0,
                            count: 0,
                            symbolVolumes: {}
                        };
                    }
                }
            }
        }

        return Object.values(aggregated).map(item => {
            const ratio = item.long_volume >= item.short_volume
                ? item.long_volume / Math.max(1, item.short_volume)
                : -(item.short_volume / Math.max(1, item.long_volume));
            return {
                timestamp: item.priceRange,
                price: item.priceRange + (item.priceRangeEnd - item.priceRange) / 2,
                long_volume: item.long_volume,
                short_volume: item.short_volume,
                total_volume: item.total_volume,
                long_short_ratio: ratio,
                symbolVolumes: item.symbolVolumes
            };
        }).sort((a, b) => a.price - b.price);
    }, [side]);

    /**
     * Adaptive/Dynamic Interval Clustering Algorithm
     *
     * Creates variable-sized buckets based on data density:
     * - High density areas (many liquidations close together) → smaller intervals (more detail)
     * - Low density areas (few/sparse liquidations) → larger intervals (less noise)
     *
     * Algorithm steps:
     * 1. Sort data by price
     * 2. Calculate local density using sliding window
     * 3. Detect peaks (high concentration areas)
     * 4. Create variable-sized buckets around peaks with smaller intervals
     * 5. Merge sparse areas into larger buckets
     *
     * @param rawData - Array of liquidation data
     * @param density - Density sensitivity (1-100), higher = more granular splitting
     * @param userMinInterval - Optional minimum allowed interval size (default: 1)
     * @param userMaxInterval - Optional maximum allowed interval size (default: 10000)
     * @returns Aggregated data with adaptive intervals
     */
    const aggregateByAdaptiveInterval = useCallback((
        rawData: HistoricalLiquidation[],
        density: number,
        userMinInterval?: number,
        userMaxInterval?: number
    ): HistoricalLiquidation[] => {
        // 1. Apply side filter first
        const sideAffectedData = rawData.map(item => {
            const long = side === 'short' ? 0 : item.long_volume;
            const short = side === 'long' ? 0 : item.short_volume;
            return {
                ...item,
                long_volume: long,
                short_volume: short,
                total_volume: long + short,
                long_short_ratio: long / (short || 1)
            };
        });

        let filtered = sideAffectedData;
        if (side !== 'all') {
            filtered = sideAffectedData.filter(item => item.total_volume > 0);
        }

        if (filtered.length === 0) return [];

        // 2. Sort by price
        const sortedData = [...filtered].sort((a, b) => a.price - b.price);

        const prices = sortedData.map(d => d.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;

        if (priceRange <= 0) return sortedData;

        // 3. Calculate density sensitivity parameters based on the slider (1-100)
        // density 1 = low sensitivity (fewer, larger clusters)
        // density 100 = high sensitivity (more, smaller clusters in dense areas)
        const densityFactor = density / 50; // 0.02 to 2.0 (normalized for 1-100 range)

        // Base interval calculation - target number of clusters scales with density
        const minClusters = Math.max(5, Math.floor(10 * densityFactor));
        const maxClusters = Math.max(20, Math.floor(100 * densityFactor));
        const targetBaseInterval = priceRange / ((minClusters + maxClusters) / 2);

        // 4. Calculate local density using OPTIMIZED sliding window (O(n) instead of O(n²))
        // Uses incremental accumulation - adds new element and removes old element from window sum
        const windowSize = Math.max(3, Math.floor(sortedData.length / (20 * densityFactor)));
        const halfWindow = Math.floor(windowSize / 2);
        const densityScores: number[] = new Array(sortedData.length);

        // Calculate total volume for relative density comparison
        const totalVolume = sortedData.reduce((sum, d) => sum + d.total_volume, 0);
        const avgVolumePerItem = totalVolume / sortedData.length;

        // Optimized sliding window: single pass O(n) instead of O(n × windowSize)
        let windowVolumeSum = 0;
        let windowStartIdx = 0;
        let windowEndIdx = 0;

        for (let i = 0; i < sortedData.length; i++) {
            // Calculate dynamic window boundaries
            const currentWindowStart = Math.max(0, i - halfWindow);
            const currentWindowEnd = Math.min(sortedData.length, i + halfWindow + 1);

            // Expand window to the right if needed
            while (windowEndIdx < currentWindowEnd) {
                windowVolumeSum += sortedData[windowEndIdx].total_volume;
                windowEndIdx++;
            }

            // Shrink window from the left if needed
            while (windowStartIdx < currentWindowStart) {
                windowVolumeSum -= sortedData[windowStartIdx].total_volume;
                windowStartIdx++;
            }

            const windowDataLength = currentWindowEnd - currentWindowStart;
            const windowPriceRange = sortedData[currentWindowEnd - 1]?.price - sortedData[currentWindowStart]?.price || 1;

            // Density score: volume per unit of price range, normalized by average
            const rawDensity = (windowVolumeSum / windowDataLength) / Math.max(windowPriceRange, targetBaseInterval / 10);
            densityScores[i] = rawDensity / (avgVolumePerItem || 1);
        }

        // Normalize density scores to 0-1 range for interval calculation
        const maxDensity = Math.max(...densityScores, 0.001); // Avoid division by zero
        const minDensity = Math.min(...densityScores);
        const densityRange = maxDensity - minDensity || 1;

        // Normalize to 0-1 scale, but preserve relative differences
        const normalizedDensities = densityScores.map(d => (d - minDensity) / densityRange);

        // 5. Detect peaks using OPTIMIZED monotonic deque (O(n) instead of O(n × peakWindow))
        // This finds local maxima in sliding window without nested loops
        const peaks: number[] = [];
        const peakWindow = Math.max(2, Math.floor(windowSize / 2));

        // Monotonic deque: stores indices with decreasing density values
        const deque: number[] = [];

        for (let i = 0; i < normalizedDensities.length; i++) {
            // Remove indices that are out of the current window
            while (deque.length > 0 && deque[0] <= i - peakWindow * 2 - 1) {
                deque.shift();
            }

            // Remove indices with density <= current (maintain decreasing order)
            while (deque.length > 0 && normalizedDensities[deque[deque.length - 1]] <= normalizedDensities[i]) {
                deque.pop();
            }

            deque.push(i);

            // Check if we have a valid window and the front is a peak
            if (i >= peakWindow * 2) {
                const windowCenter = i - peakWindow;
                const maxIdx = deque[0];

                // It's a peak if max is at the center and above threshold
                if (maxIdx === windowCenter && normalizedDensities[maxIdx] > 0.3) {
                    // Avoid duplicate peaks
                    if (peaks.length === 0 || peaks[peaks.length - 1] !== maxIdx) {
                        peaks.push(maxIdx);
                    }
                }
            }
        }

        // Handle remaining windows at the end
        for (let i = normalizedDensities.length - peakWindow; i < normalizedDensities.length; i++) {
            if (peaks.includes(i)) continue;

            let isLocalMax = true;
            const start = Math.max(0, i - peakWindow);
            const end = Math.min(normalizedDensities.length, i + peakWindow + 1);

            for (let j = start; j < end; j++) {
                if (j !== i && normalizedDensities[j] >= normalizedDensities[i]) {
                    isLocalMax = false;
                    break;
                }
            }

            if (isLocalMax && normalizedDensities[i] > 0.3) {
                peaks.push(i);
            }
        }

        // 6. Create adaptive buckets
        const buckets: {
            priceStart: number;
            priceEnd: number;
            items: HistoricalLiquidation[];
            targetInterval: number;
        }[] = [];

        // Define interval sizes based on local density
        // Dense areas (near peaks): smaller intervals
        // Sparse areas: larger intervals
        const calculatedMinInterval = targetBaseInterval / (2 * densityFactor);
        const calculatedMaxInterval = targetBaseInterval * (2 / densityFactor);

        // Apply user-defined bounds if provided
        const absoluteMinInterval = userMinInterval !== undefined ? userMinInterval : 1;
        const absoluteMaxInterval = userMaxInterval !== undefined ? userMaxInterval : 10000;

        // Clamp the calculated intervals to respect user bounds
        const minInterval = Math.max(calculatedMinInterval, absoluteMinInterval);
        const maxInterval = Math.min(calculatedMaxInterval, absoluteMaxInterval);

        // Debug logging to verify inverse relationship
        const debugInfo: { price: number; density: number; interval: number }[] = [];

        let currentBucketStart = 0;

        while (currentBucketStart < sortedData.length) {
            const currentPrice = sortedData[currentBucketStart].price;
            const currentDensity = normalizedDensities[currentBucketStart];

            // Calculate adaptive interval using INVERSE relationship to density
            // Formula: interval = maxInterval / (1 + density * sensitivity)
            // This ensures:
            // - When density is 2x higher → interval is ~2x smaller
            // - When density → 0, interval → maxInterval
            // - When density → 1, interval → maxInterval / (1 + sensitivity)
            const sensitivity = 3.0; // Controls strength of inverse relationship
            const densityMultiplier = 1 + (currentDensity * sensitivity);
            let adaptiveInterval = maxInterval / densityMultiplier;

            // Clamp to ensure we respect bounds
            adaptiveInterval = Math.max(minInterval, Math.min(maxInterval, adaptiveInterval));

            // Debug: Log first few iterations to verify inverse relationship
            if (debugInfo.length < 10) {
                debugInfo.push({
                    price: currentPrice,
                    density: Math.round(currentDensity * 100) / 100,
                    interval: Math.round(adaptiveInterval)
                });
            }

            // Find the end of this bucket
            let bucketEnd = currentBucketStart;
            const priceStart = sortedData[currentBucketStart].price;
            let priceEnd = priceStart + adaptiveInterval;

            // Expand bucket to include all items within the price range
            while (bucketEnd < sortedData.length && sortedData[bucketEnd].price < priceEnd) {
                bucketEnd++;
            }

            // Ensure minimum number of items per bucket (avoid too many tiny buckets)
            const minItemsPerBucket = Math.max(1, Math.floor(3 / densityFactor));
            if (bucketEnd - currentBucketStart < minItemsPerBucket && bucketEnd < sortedData.length) {
                bucketEnd = Math.min(currentBucketStart + minItemsPerBucket, sortedData.length);
                priceEnd = sortedData[bucketEnd - 1].price;
            }

            // Create bucket
            const bucketItems = sortedData.slice(currentBucketStart, bucketEnd);
            if (bucketItems.length > 0) {
                buckets.push({
                    priceStart: priceStart,
                    priceEnd: priceEnd,
                    items: bucketItems,
                    targetInterval: adaptiveInterval
                });
            }

            currentBucketStart = bucketEnd;
        }

        // 7. Merge very small adjacent buckets in sparse areas (optional optimization)
        // OPTIMIZATION: Use stack-based approach for O(n) instead of O(n²) nested loops
        const mergedBuckets: typeof buckets = [];

        for (let i = 0; i < buckets.length; i++) {
            const current = buckets[i];

            if (mergedBuckets.length === 0) {
                mergedBuckets.push({ ...current });
                continue;
            }

            // Get the last merged bucket
            const lastMerged = mergedBuckets[mergedBuckets.length - 1];

            // Use current bucket's density index for merge decision
            const densityIndex = Math.min(currentBucketStart, normalizedDensities.length - 1);
            const avgDensity = normalizedDensities[densityIndex] || 0;

            // Merge conditions
            const isSparseArea = avgDensity < 0.3;
            const isSmallBucket = lastMerged.items.length < 3 && current.items.length < 3;
            const combinedSize = lastMerged.items.length + current.items.length;
            const wouldBeReasonableSize = combinedSize <= Math.max(10, 15 / densityFactor);

            if (isSparseArea && isSmallBucket && wouldBeReasonableSize) {
                // Merge current into last merged bucket
                mergedBuckets[mergedBuckets.length - 1] = {
                    priceStart: lastMerged.priceStart,
                    priceEnd: current.priceEnd,
                    items: [...lastMerged.items, ...current.items],
                    targetInterval: lastMerged.targetInterval + current.targetInterval
                };
            } else {
                // Can't merge, add as new bucket
                mergedBuckets.push({ ...current });
            }
        }

        // 8. Aggregate data within each bucket
        const aggregated: HistoricalLiquidation[] = mergedBuckets.map(bucket => {
            const items = bucket.items;
            // OPTIMIZED: Single reduce computing all values instead of 3 separate reduces
            const { totalLongVolume, totalShortVolume, weightedPriceSum } = items.reduce((acc, item) => ({
                totalLongVolume: acc.totalLongVolume + item.long_volume,
                totalShortVolume: acc.totalShortVolume + item.short_volume,
                weightedPriceSum: acc.weightedPriceSum + item.price * item.total_volume
            }), { totalLongVolume: 0, totalShortVolume: 0, weightedPriceSum: 0 });
            const totalVolume = totalLongVolume + totalShortVolume;

            // Calculate weighted average price
            const avgPrice = totalVolume > 0 ? weightedPriceSum / totalVolume :
                (bucket.priceStart + bucket.priceEnd) / 2;

            const ratio = totalLongVolume >= totalShortVolume
                ? totalLongVolume / Math.max(1, totalShortVolume)
                : -(totalShortVolume / Math.max(1, totalLongVolume));

            const symbolVolumes: Record<string, { long: number; short: number; avgOriginalPrice: number }> = {};
            items.forEach(item => {
                if (item.symbol) {
                    if (!symbolVolumes[item.symbol]) {
                        symbolVolumes[item.symbol] = { long: 0, short: 0, avgOriginalPrice: 0 };
                    }
                    const sv = symbolVolumes[item.symbol];
                    const oldTotal = sv.long + sv.short;
                    sv.long += item.long_volume;
                    sv.short += item.short_volume;
                    const newTotal = sv.long + sv.short;

                    if (newTotal > 0 && item.original_price) {
                        sv.avgOriginalPrice = ((sv.avgOriginalPrice * oldTotal) + (item.original_price * item.total_volume)) / newTotal;
                    }
                }
            });

            return {
                timestamp: bucket.priceStart, // Use price start as timestamp for range identification
                price: avgPrice,
                long_volume: totalLongVolume,
                short_volume: totalShortVolume,
                total_volume: totalVolume,
                long_short_ratio: ratio,
                symbolVolumes
            };
        });

        // Debug: Log the inverse density-interval relationship
        if (debugInfo.length > 0) {
            console.log('=== Adaptive Interval Algorithm Debug ===');
            console.log(`Min Interval: ${minInterval}, Max Interval: ${maxInterval}, Sensitivity: 3.0`);
            console.log('Price | Density | Interval (inverse relationship)');
            console.log('------|---------|----------');
            debugInfo.forEach(info => {
                console.log(`${info.price.toFixed(0).padStart(5)} | ${info.density.toFixed(2).padStart(7)} | ${info.interval}`);
            });
            console.log('=== End Debug ===');
        }

        return aggregated.sort((a, b) => a.price - b.price);
    }, [side]);

    /**
     * Fixed Count Interval Clustering Algorithm
     *
     * Creates exactly N buckets of uniform size across the price range:
     * - Calculates interval size as (maxPrice - minPrice) / targetCount
     * - Creates exactly targetCount buckets of equal size
     * - Aggregates data within each bucket
     *
     * @param rawData - Array of liquidation data
     * @param targetCount - Exact number of intervals/buckets to create (e.g., 77)
     * @returns Aggregated data with exactly targetCount items
     */
    const aggregateByFixedCount = useCallback((
        rawData: HistoricalLiquidation[],
        targetCount: number
    ): HistoricalLiquidation[] => {
        // Validate target count
        const validTargetCount = Math.max(1, Math.min(500, targetCount));

        // 1. Apply side filter first
        const sideAffectedData = rawData.map(item => {
            const long = side === 'short' ? 0 : item.long_volume;
            const short = side === 'long' ? 0 : item.short_volume;
            const ratio = long >= short
                ? long / Math.max(1, short)
                : -(short / Math.max(1, long));
            return {
                ...item,
                long_volume: long,
                short_volume: short,
                total_volume: long + short,
                long_short_ratio: ratio
            };
        });

        let filtered = sideAffectedData;
        if (side !== 'all') {
            filtered = sideAffectedData.filter(item => item.total_volume > 0);
        }

        if (filtered.length === 0) return [];

        // 2. Sort by price
        const sortedData = [...filtered].sort((a, b) => a.price - b.price);

        const prices = sortedData.map(d => d.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;

        if (priceRange <= 0) return sortedData;

        // 3. Calculate uniform interval size
        const intervalSize = priceRange / validTargetCount;

        // 4. Create exactly targetCount buckets
        // OPTIMIZATION: Use two-pointer technique instead of O(n²) filter inside loop
        const buckets: {
            priceStart: number;
            priceEnd: number;
            items: HistoricalLiquidation[];
        }[] = [];

        let dataIndex = 0;
        for (let i = 0; i < validTargetCount; i++) {
            const priceStart = minPrice + (i * intervalSize);
            const priceEnd = minPrice + ((i + 1) * intervalSize);
            const isLastBucket = i === validTargetCount - 1;

            // Collect items for this bucket using two-pointer technique (O(n) total)
            const bucketItems: HistoricalLiquidation[] = [];
            while (dataIndex < sortedData.length) {
                const item = sortedData[dataIndex];
                // For last bucket, include items <= priceEnd; otherwise items < priceEnd
                const priceCondition = isLastBucket ? item.price <= priceEnd : item.price < priceEnd;

                if (item.price >= priceStart && priceCondition) {
                    bucketItems.push(item);
                    dataIndex++;
                } else if (item.price < priceStart) {
                    // This shouldn't happen if data is sorted, but skip just in case
                    dataIndex++;
                } else {
                    // Item is beyond this bucket's range, move to next bucket
                    break;
                }
            }

            buckets.push({
                priceStart,
                priceEnd,
                items: bucketItems
            });
        }

        // 5. Aggregate data within each bucket
        const aggregated: HistoricalLiquidation[] = buckets.map(bucket => {
            const items = bucket.items;
            // OPTIMIZED: Single reduce computing all values instead of 3 separate reduces
            const { totalLongVolume, totalShortVolume, weightedPriceSum } = items.reduce((acc, item) => ({
                totalLongVolume: acc.totalLongVolume + item.long_volume,
                totalShortVolume: acc.totalShortVolume + item.short_volume,
                weightedPriceSum: acc.weightedPriceSum + item.price * item.total_volume
            }), { totalLongVolume: 0, totalShortVolume: 0, weightedPriceSum: 0 });
            const totalVolume = totalLongVolume + totalShortVolume;

            // Calculate weighted average price
            const avgPrice = totalVolume > 0 ? weightedPriceSum / totalVolume :
                (bucket.priceStart + bucket.priceEnd) / 2;

            const ratio = totalLongVolume >= totalShortVolume
                ? totalLongVolume / Math.max(1, totalShortVolume)
                : -(totalShortVolume / Math.max(1, totalLongVolume));

            const symbolVolumes: Record<string, { long: number; short: number; avgOriginalPrice: number }> = {};
            items.forEach(item => {
                if (item.symbol) {
                    if (!symbolVolumes[item.symbol]) {
                        symbolVolumes[item.symbol] = { long: 0, short: 0, avgOriginalPrice: 0 };
                    }
                    const sv = symbolVolumes[item.symbol];
                    const oldTotal = sv.long + sv.short;
                    sv.long += item.long_volume;
                    sv.short += item.short_volume;
                    const newTotal = sv.long + sv.short;

                    if (newTotal > 0 && item.original_price) {
                        sv.avgOriginalPrice = ((sv.avgOriginalPrice * oldTotal) + (item.original_price * item.total_volume)) / newTotal;
                    }
                }
            });

            return {
                timestamp: bucket.priceStart, // Use price start as timestamp for range identification
                price: avgPrice,
                long_volume: totalLongVolume,
                short_volume: totalShortVolume,
                total_volume: totalVolume,
                long_short_ratio: ratio,
                symbolVolumes
            };
        });

        // Filter out empty buckets and return
        return aggregated
            .filter(bucket => bucket.total_volume > 0 || buckets.length <= 100)
            .sort((a, b) => a.price - b.price);
    }, [side]);

    // Calculate a "smart" interval based on price range and desired cluster density
    const calculateSmartInterval = (rawData: HistoricalLiquidation[], density: number): number => {
        if (!rawData || rawData.length === 0) return 1000;

        // Find min and max prices in the data
        const prices = rawData.map(item => item.price).filter(p => p > 0);
        if (prices.length === 0) return 1000;

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;

        if (priceRange <= 0) return 1000;

        // Map density (1-100) to target cluster count (5-200)
        // density 1 = 5 clusters (fewer, larger intervals)
        // density 100 = 200 clusters (more, smaller intervals)
        const minClusters = 5;
        const maxClusters = 200;
        const targetClusterCount = minClusters + ((density - 1) / 99) * (maxClusters - minClusters);

        // Calculate raw interval
        const rawInterval = priceRange / targetClusterCount;

        // Round to a "nice" number
        const niceNumbers = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

        // Find the closest nice number
        let bestInterval = niceNumbers[0];
        let minDiff = Math.abs(rawInterval - niceNumbers[0]);

        for (const nice of niceNumbers) {
            const diff = Math.abs(rawInterval - nice);
            if (diff < minDiff) {
                minDiff = diff;
                bestInterval = nice;
            }
        }

        // If the raw interval is larger than the largest nice number, round to nearest 10000
        if (rawInterval > niceNumbers[niceNumbers.length - 1]) {
            bestInterval = Math.ceil(rawInterval / 10000) * 10000;
        }

        return bestInterval;
    };

    // Function to fetch ONLY the current price without reloading history
    const updateCurrentPrice = async () => {
        if (!symbol || isFetchingPriceRef.current) return;

        // Skip if price was updated recently via WebSocket
        if (lastMessage?.type === 'price' && lastMessage.data.symbol === symbol.replace('_PERP.A', '')) {
            const wsPriceTime = new Date(lastMessage.data.timestamp).getTime();
            if (Date.now() - wsPriceTime < 10000) {
                console.log(`[Auto-Update] Skipping fetch, WS price is fresh: ${lastMessage.data.price}`);
                return;
            }
        }

        isFetchingPriceRef.current = true;
        try {
            // Do NOT pass start_date/end_date here — the system clock is in 2026 and
            // passing Date.now() as timestamps causes Binance to reject the request.
            // api.ts will use a safe limit-only query (limit=365) when no dates are given.
            const response = await pricesApi.getAll({ symbol });

            const priceData = response.data.data || [];
            if (priceData.length > 0) {
                const latestPrice = priceData[priceData.length - 1].price;
                if (latestPrice > 0) {
                    console.log(`[Auto-Update] New price for ${symbol}: ${latestPrice}`);
                    setCurrentPrice(latestPrice);
                }
            }
        } catch (error) {
            console.error('Error auto-updating price:', error);
        } finally {
            isFetchingPriceRef.current = false;
        }
    };

    // Auto-update price effect
    useEffect(() => {
        if (priceRefreshInterval <= 0) return;

        const intervalId = setInterval(updateCurrentPrice, priceRefreshInterval * 1000);
        return () => clearInterval(intervalId);
    }, [symbol, priceRefreshInterval]);

    const fetchLiquidationData = async () => {
        setStatus({ message: 'Fetching liquidation data...', type: 'loading' });

        if (apiKey && apiKey !== 'FREE') {
            localStorage.setItem('coinalyze_api_key', apiKey);
        }

        const end = Math.floor(Date.now() / 1000);
        const start = months === 0 ? end - (10 * 365 * 24 * 60 * 60) : end - (months * 30 * 24 * 60 * 60);

        try {
            if (isMultiAssetMode && selectedSymbols.length > 0) {
                // Fetch BTC price for normalization
                const btcPricePromise = pricesApi.getAll({
                    symbol: 'BTCUSDT_PERP.A', // Base standard
                    start_date: new Date(start * 1000).toISOString(),
                    end_date: new Date(end * 1000).toISOString()
                });

                // Fetch liquidations for all selected symbols in batches of 3 with 3s delay
                const BATCH_SIZE = 3;
                const batches = [];
                for (let i = 0; i < selectedSymbols.length; i += BATCH_SIZE) {
                    batches.push(selectedSymbols.slice(i, i + BATCH_SIZE));
                }

                const liquidationResults: any[] = [];
                for (let i = 0; i < batches.length; i++) {
                    const batch = batches[i];

                    // Add delay between batches (except the first one) to stay under strict rate limits
                    if (i > 0) {
                        setStatus({ message: `Waiting to avoid rate limits (${i + 1}/${batches.length})...`, type: 'loading' });
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }

                    const batchSymbols = batch.join(',');
                    const res = await liquidationsApi.getAll({
                        symbol: batchSymbols,
                        start_date: new Date(start * 1000).toISOString(),
                        end_date: new Date(end * 1000).toISOString(),
                        amount_min: 0
                    });

                    // OPTIMIZED: O(n) grouping using Map instead of O(n²) filter in loop
                    const batchData = res.data.data;
                    const groupedBySymbol = new Map<string, any[]>();

                    // Single pass O(n) to group all items by symbol
                    for (const item of batchData) {
                        const sym = item.symbol;
                        if (!groupedBySymbol.has(sym)) {
                            groupedBySymbol.set(sym, []);
                        }
                        groupedBySymbol.get(sym)!.push(item);
                    }

                    // O(m) where m = number of symbols (much smaller than n)
                    for (const sym of batch) {
                        liquidationResults.push({
                            symbol: sym,
                            data: groupedBySymbol.get(sym) || []
                        });
                    }
                }

                const btcPriceRes = await btcPricePromise;

                return {
                    isMulti: true,
                    liquidations: liquidationResults,
                    price: btcPriceRes.data.data
                };
            } else {
                const liqResponse = await liquidationsApi.getAll({
                    symbol: symbol,
                    start_date: new Date(start * 1000).toISOString(),
                    end_date: new Date(end * 1000).toISOString(),
                    amount_min: 0
                });

                const priceResponse = await pricesApi.getAll({
                    symbol: symbol,
                    start_date: new Date(start * 1000).toISOString(),
                    end_date: new Date(end * 1000).toISOString()
                });

                return {
                    isMulti: false,
                    liquidation: liqResponse.data.data,
                    price: priceResponse.data.data
                };
            }
        } catch (error: any) {
            throw error;
        }
    };

    const cacheKeyBase = isMultiAssetMode
        ? `liquidation_multi_v2_${[...selectedSymbols].sort().join('-')}_${months}`
        : `liquidation_v2_${symbol}_${months}`;

    // Hook de cache - desabilitado para evitar fetch automático
    const { isLoading, refetch, isFromCache, clearCache } = useCacheData({
        cacheKey: cacheKeyBase,
        fetchFn: fetchLiquidationData,
        ttlMinutes: 30,
        enabled: false, // Desabilitado - só fetch quando explicitamente solicitado
        onSuccess: async (result) => {
            const data = result as any;
            if (!data) return;

            const priceData = Array.isArray(data.price) ? data.price : [];
            const priceMap = new Map();
            const sortedPrices = [...priceData].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));

            sortedPrices.forEach((p: any) => {
                const ts = Number(p.timestamp);
                const dateKey = new Date(ts * 1000).toISOString().split('T')[0];
                priceMap.set(dateKey, p.price);
            });

            // OPTIMIZED: Binary search for O(log n) instead of O(n)
            const binarySearchClosest = (sortedPrices: any[], targetTimestamp: number): any | null => {
                let left = 0, right = sortedPrices.length - 1;
                let closest = sortedPrices[0];
                let minDiff = Infinity;

                while (left <= right) {
                    const mid = Math.floor((left + right) / 2);
                    const diff = Math.abs(Number(sortedPrices[mid].timestamp) - targetTimestamp);

                    if (diff < minDiff) {
                        minDiff = diff;
                        closest = sortedPrices[mid];
                    }

                    if (Number(sortedPrices[mid].timestamp) < targetTimestamp) {
                        left = mid + 1;
                    } else {
                        right = mid - 1;
                    }
                }
                return closest;
            };

            const getNormalizedPrice = (timestamp: number, itemPrice: number) => {
                const dateKey = new Date(timestamp * 1000).toISOString().split('T')[0];
                let basePrice = priceMap.get(dateKey);

                if (basePrice === undefined && sortedPrices.length > 0) {
                    const nearest = binarySearchClosest(sortedPrices, timestamp);
                    if (nearest) {
                        const minDiff = Math.abs(Number(nearest.timestamp) - timestamp);
                        if (minDiff <= 7 * 24 * 60 * 60) {
                            basePrice = nearest.price;
                        }
                    }
                }

                if (basePrice === undefined || basePrice === 0) {
                    basePrice = itemPrice;
                }

                return basePrice;
            };

            const mapLiquidationItem = (item: any, symbolLabel?: string) => {
                const timestamp = Number(item.timestamp);
                const itemPrice = Number(item.price);
                const finalPrice = getNormalizedPrice(timestamp, itemPrice);

                const longVolume = item.long_volume !== undefined ? item.long_volume : (item.side === 'long' ? item.amount : 0);
                const shortVolume = item.short_volume !== undefined ? item.short_volume : (item.side === 'short' ? item.amount : 0);

                return {
                    timestamp: timestamp,
                    long_volume: longVolume,
                    short_volume: shortVolume,
                    total_volume: item.amount,
                    long_short_ratio: longVolume >= shortVolume
                        ? longVolume / Math.max(1, shortVolume)
                        : -(shortVolume / Math.max(1, longVolume)),
                    price: finalPrice,
                    symbol: symbolLabel,
                    original_price: itemPrice
                };
            };

            let allMapped: HistoricalLiquidation[] = [];

            if (data.isMulti) {
                data.liquidations.forEach((liqGroup: any) => {
                    if (Array.isArray(liqGroup.data)) {
                        allMapped = allMapped.concat(liqGroup.data.map((item: any) => mapLiquidationItem(item, liqGroup.symbol)));
                    }
                });
            } else {
                if (Array.isArray(data.liquidation)) {
                    allMapped = data.liquidation.map((item: any) => mapLiquidationItem(item, symbol));
                }
            }

            allMapped.sort((a, b) => a.timestamp - b.timestamp);

            setData(allMapped);

            // Set current price from the last price data entry
            if (priceData.length > 0) {
                setCurrentPrice(Number(priceData[priceData.length - 1].price || 0));
            }

            setLastFetchTime(Date.now());
            setCacheStatus('loaded_from_api');
            setStatus({
                message: `Dados atualizados da API (${allMapped.length} registros).`,
                type: 'success'
            });
            setShouldFetchNewData(false);
        },
        onError: (error) => {
            console.error('Fetch error:', error);
            const errorMessage = error?.message || error?.toString() || 'Error fetching data';
            let enhancedMessage = errorMessage;

            if (errorMessage.includes('Network Error') || errorMessage.includes('403') || errorMessage.includes('CERT')) {
                enhancedMessage = `${errorMessage}. This is likely a CORS or SSL proxy issue.`;

                // Check for future clock issues (common in simulated environments)
                if (new Date().getFullYear() > 2025) {
                    enhancedMessage += " NOTE: Your system clock is set to 2026+, which may cause SSL certificates to appear expired. Please check your system time.";
                } else {
                    enhancedMessage += " Please check your internet connection or try again later.";
                }
            }

            setStatus({ message: enhancedMessage, type: 'error' });
            setShouldFetchNewData(false);
        }
    });

    // Função para carregar dados do cache no mount
    useEffect(() => {
        const loadFromCache = async () => {
            if (isInitialLoadComplete) return;

            setCacheStatus('loading_cache');
            setStatus({ message: 'Verificando cache local...', type: 'loading' });

            try {
                // Usar o dbCache para dados grandes
                const cachedData = await dbCache.get<any>(cacheKeyBase);

                if (cachedData) {
                    console.log('[Cache] Dados encontrados no cache:', cacheKeyBase);

                    const priceData = Array.isArray(cachedData.price) ? cachedData.price : [];
                    const priceMap = new Map();
                    const sortedPrices = [...priceData].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));

                    sortedPrices.forEach((p: any) => {
                        const ts = Number(p.timestamp);
                        const dateKey = new Date(ts * 1000).toISOString().split('T')[0];
                        priceMap.set(dateKey, p.price);
                    });

                    // OPTIMIZED: Binary search for O(log n) instead of O(n)
                    const binarySearchClosest = (sortedPrices: any[], targetTimestamp: number): any | null => {
                        let left = 0, right = sortedPrices.length - 1;
                        let closest = sortedPrices[0];
                        let minDiff = Infinity;

                        while (left <= right) {
                            const mid = Math.floor((left + right) / 2);
                            const diff = Math.abs(Number(sortedPrices[mid].timestamp) - targetTimestamp);

                            if (diff < minDiff) {
                                minDiff = diff;
                                closest = sortedPrices[mid];
                            }

                            if (Number(sortedPrices[mid].timestamp) < targetTimestamp) {
                                left = mid + 1;
                            } else {
                                right = mid - 1;
                            }
                        }
                        return closest;
                    };

                    const getNormalizedPrice = (timestamp: number, itemPrice: number) => {
                        const dateKey = new Date(timestamp * 1000).toISOString().split('T')[0];
                        let basePrice = priceMap.get(dateKey);

                        if (basePrice === undefined && sortedPrices.length > 0) {
                            const nearest = binarySearchClosest(sortedPrices, timestamp);
                            if (nearest) {
                                const minDiff = Math.abs(Number(nearest.timestamp) - timestamp);
                                if (minDiff <= 7 * 24 * 60 * 60) {
                                    basePrice = nearest.price;
                                }
                            }
                        }

                        if (basePrice === undefined || basePrice === 0) {
                            basePrice = itemPrice;
                        }

                        return basePrice;
                    };

                    const mapLiquidationItem = (item: any, symbolLabel?: string) => {
                        const timestamp = Number(item.timestamp);
                        const itemPrice = Number(item.price);
                        const finalPrice = getNormalizedPrice(timestamp, itemPrice);

                        const longVolume = item.long_volume !== undefined ? item.long_volume : (item.side === 'long' ? item.amount : 0);
                        const shortVolume = item.short_volume !== undefined ? item.short_volume : (item.side === 'short' ? item.amount : 0);

                        return {
                            timestamp: timestamp,
                            long_volume: longVolume,
                            short_volume: shortVolume,
                            total_volume: item.amount,
                            long_short_ratio: longVolume >= shortVolume
                                ? longVolume / Math.max(1, shortVolume)
                                : -(shortVolume / Math.max(1, longVolume)),
                            price: finalPrice,
                            symbol: symbolLabel,
                            original_price: itemPrice
                        };
                    };

                    let allMapped: HistoricalLiquidation[] = [];

                    if (cachedData.isMulti) {
                        cachedData.liquidations.forEach((liqGroup: any) => {
                            if (Array.isArray(liqGroup.data)) {
                                allMapped = allMapped.concat(liqGroup.data.map((item: any) => mapLiquidationItem(item, liqGroup.symbol)));
                            }
                        });
                    } else {
                        if (Array.isArray(cachedData.liquidation)) {
                            allMapped = cachedData.liquidation.map((item: any) => mapLiquidationItem(item, symbol));
                        }
                    }

                    allMapped.sort((a, b) => a.timestamp - b.timestamp);

                    setData(allMapped);

                    if (priceData.length > 0) {
                        setCurrentPrice(Number(priceData[priceData.length - 1].price || 0));
                    }

                    setLastFetchTime(Date.now());
                    setCacheStatus('loaded_from_cache');
                    setStatus({
                        message: `Dados carregados do cache (${allMapped.length} registros). Clique em "Atualizar Dados" para buscar novos dados.`,
                        type: 'success'
                    });
                } else {
                    console.log('[Cache] Nenhum dado em cache, aguardando ação do usuário');
                    setCacheStatus('idle');
                    setStatus({
                        message: 'Nenhum dado em cache. Clique em "Atualizar Dados" para buscar da API.',
                        type: 'success'
                    });
                }
            } catch (error) {
                console.error('[Cache] Erro ao carregar do cache:', error);
                setCacheStatus('idle');
                setStatus({
                    message: 'Erro ao carregar cache. Clique em "Atualizar Dados" para tentar da API.',
                    type: 'error'
                });
            } finally {
                setIsInitialLoadComplete(true);
            }
        };

        loadFromCache();
    }, [cacheKeyBase, symbol, isMultiAssetMode]);

    // Handler para atualização manual
    const handleUpdateData = useCallback(async () => {
        setShouldFetchNewData(true);
        setCacheStatus('fetching_api');
        setStatus({ message: 'Buscando novos dados da API...', type: 'loading' });
        await refetch(true);
    }, [refetch]);

    // Helper to get adaptive interval statistics for display
    const getAdaptiveIntervalStats = (processedData: HistoricalLiquidation[]): { min: number; max: number; avg: number; count: number } => {
        if (processedData.length < 2) return { min: 0, max: 0, avg: 0, count: processedData.length };

        const intervals: number[] = [];
        for (let i = 1; i < processedData.length; i++) {
            const interval = processedData[i].price - processedData[i - 1].price;
            if (interval > 0) intervals.push(interval);
        }

        if (intervals.length === 0) return { min: 0, max: 0, avg: 0, count: processedData.length };

        return {
            min: Math.min(...intervals),
            max: Math.max(...intervals),
            avg: intervals.reduce((a, b) => a + b, 0) / intervals.length,
            count: processedData.length
        };
    };

    /**
     * Normal Distribution Analysis - OPTIMIZED with Welford's algorithm
     *
     * Calculates weighted mean and standard deviation in a SINGLE PASS (O(n) instead of O(2n)).
     * Uses Welford's online algorithm adapted for weighted variance calculation.
     * Weights are based on volume (higher volume = more weight in calculation).
     *
     * @param data - Array of liquidation data
     * @returns Statistics including mean, stdDev, and standard deviation regions
     */
    const calculateNormalDistribution = (data: HistoricalLiquidation[]) => {
        if (data.length === 0) return null;

        // Single-pass weighted statistics using Welford's algorithm
        let totalVolume = 0;
        let mean = 0;
        let M2 = 0;  // Accumulator for weighted variance

        for (const item of data) {
            const volume = item.total_volume;
            if (volume === 0) continue;

            totalVolume += volume;
            const delta = item.price - mean;
            const deltaRatio = delta * volume / totalVolume;
            mean += deltaRatio;
            const delta2 = item.price - mean;
            M2 += volume * delta * delta2;
        }

        if (totalVolume === 0) return null;

        const variance = M2 / totalVolume;
        const stdDev = Math.sqrt(variance);

        // Define standard deviation regions
        const regions = {
            sd0_25: [mean - 0.25 * stdDev, mean + 0.25 * stdDev] as [number, number],  // 20% of data
            sd0_5: [mean - 0.5 * stdDev, mean + 0.5 * stdDev] as [number, number],  // 38% of data
            sd1: [mean - stdDev, mean + stdDev] as [number, number],  // 68% of data
            sd2: [mean - 2 * stdDev, mean + 2 * stdDev] as [number, number],  // 95% of data
            sd3: [mean - 3 * stdDev, mean + 3 * stdDev] as [number, number],  // 99.7% of data
        };

        return {
            mean,
            stdDev,
            regions,
        };
    };

    useEffect(() => {
        const min = amountMin && !isNaN(parseFloat(amountMin)) ? parseFloat(amountMin) : 0;
        const max = amountMax && !isNaN(parseFloat(amountMax)) ? parseFloat(amountMax) : Infinity;
        const ratioMin = ratioFilter && !isNaN(parseFloat(ratioFilter)) ? parseFloat(ratioFilter) : null;
        const ratioMax = ratioFilterMax && !isNaN(parseFloat(ratioFilterMax)) ? parseFloat(ratioFilterMax) : null;

        // First filter by min/max amount
        let amountFiltered = data.filter(item =>
            item.total_volume >= min && (max === Infinity || item.total_volume <= max)
        );

        // Then filter by ratio if specified (using modulus/absolute value)
        if (ratioMin !== null || ratioMax !== null) {
            amountFiltered = amountFiltered.filter(item => {
                const absRatio = Math.abs(item.long_short_ratio);
                if (ratioMin !== null && absRatio < ratioMin) return false;
                if (ratioMax !== null && absRatio > ratioMax) return false;
                return true;
            });
        }

        // Apply price range filter if using fixed interval count mode
        let dataForProcessing = amountFiltered;
        if (useFixedIntervalCount) {
            const priceMin = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null;
            const priceMax = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null;

            if (priceMin !== null && priceMax !== null) {
                const actualMin = Math.min(priceMin, priceMax);
                const actualMax = Math.max(priceMin, priceMax);
                dataForProcessing = amountFiltered.filter(item => item.price >= actualMin && item.price <= actualMax);
            }
        }

        // Use fixed count mode, adaptive clustering, or uniform aggregation based on selection
        if (useFixedIntervalCount) {
            // Use fixed number of intervals
            const fixedCountData = aggregateByFixedCount(dataForProcessing, fixedIntervalCount);
            setProcessedData(fixedCountData);
        } else if (smartIntervalEnabled) {
            let dataForAdaptive = amountFiltered;

            // If scope is 'range', filter by price range BEFORE applying adaptive clustering
            if (adaptiveScope === 'range') {
                const priceMin = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null;
                const priceMax = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null;

                if (priceMin !== null && priceMax !== null) {
                    const actualMin = Math.min(priceMin, priceMax);
                    const actualMax = Math.max(priceMin, priceMax);
                    dataForAdaptive = amountFiltered.filter(item => item.price >= actualMin && item.price <= actualMax);
                }
            }

            // Use the new adaptive/dynamic interval clustering with min/max bounds
            const adaptiveData = aggregateByAdaptiveInterval(dataForAdaptive, clusterDensity, minInterval, maxInterval);
            setProcessedData(adaptiveData);
        } else {
            // Use uniform interval aggregation
            setProcessedData(aggregateByPriceInterval(amountFiltered, priceInterval));
        }
    }, [data, priceInterval, side, amountMin, amountMax, ratioFilter, ratioFilterMax, smartIntervalEnabled, clusterDensity, minInterval, maxInterval, adaptiveScope, priceRangeMin, priceRangeMax, useFixedIntervalCount, fixedIntervalCount, aggregateByPriceInterval, aggregateByAdaptiveInterval, aggregateByFixedCount]);

    // Filter data for chart display based on groupBy selection and price range
    const chartData = useMemo(() => {
        let filteredData = processedData;

        // Apply price range filter if both min and max are provided
        const minPrice = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null;
        const maxPrice = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null;

        if (minPrice !== null && maxPrice !== null) {
            const actualMin = Math.min(minPrice, maxPrice);
            const actualMax = Math.max(minPrice, maxPrice);
            filteredData = filteredData.filter(item => item.price >= actualMin && item.price <= actualMax);
        }

        if (groupBy === 'none' || groupBy === 'combined' || groupBy === 'stacked') {
            return filteredData;
        }
        return filteredData.map(item => ({
            ...item,
            long_volume: groupBy === 'long' ? item.long_volume : 0,
            short_volume: groupBy === 'short' ? item.short_volume : 0,
            total_volume: groupBy === 'long' ? item.long_volume : groupBy === 'short' ? item.short_volume : item.total_volume
        }));
    }, [processedData, groupBy, priceRangeMin, priceRangeMax]);

    // Calculate normal distribution statistics when enabled and data changes
    useEffect(() => {
        if (normalDistributionEnabled && processedData.length > 0) {
            let dataForNormalDist = processedData;

            // If scope is 'range', filter by price range before calculating
            if (normalDistScope === 'range') {
                const priceMin = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null;
                const priceMax = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null;

                if (priceMin !== null && priceMax !== null) {
                    const actualMin = Math.min(priceMin, priceMax);
                    const actualMax = Math.max(priceMin, priceMax);
                    dataForNormalDist = processedData.filter(item => item.price >= actualMin && item.price <= actualMax);
                }
            }

            const stats = calculateNormalDistribution(dataForNormalDist);
            setStdDevData(stats);
        } else {
            setStdDevData(null);
        }
    }, [normalDistributionEnabled, processedData, normalDistScope, priceRangeMin, priceRangeMax]);

    // OPTIMIZED: Single pass reduce for stats calculation
    const stats = (() => {
        if (processedData.length === 0) {
            return { totalRecords: 0, totalVolume: 0, avgVolume: 0, maxVolume: 0 };
        }
        const result = processedData.reduce((acc, item) => {
            acc.totalVolume += item.total_volume;
            acc.maxVolume = Math.max(acc.maxVolume, item.total_volume);
            return acc;
        }, { totalVolume: 0, maxVolume: 0 });
        return {
            totalRecords: processedData.length,
            totalVolume: result.totalVolume,
            avgVolume: result.totalVolume / processedData.length,
            maxVolume: result.maxVolume
        };
    })();

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Resumo Histórico Coinalyze</h2>
                    <p className="text-muted-foreground">Análise de volume de liquidação por faixa de preço</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleUpdateData}
                        disabled={isLoading || cacheStatus === 'fetching_api'}
                        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        title={cacheStatus === 'loaded_from_cache' ? 'Dados do cache - clique para atualizar da API' : 'Buscar dados da API'}
                    >
                        {(isLoading || cacheStatus === 'fetching_api') ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {cacheStatus === 'loaded_from_cache' ? 'Atualizar Dados (Cache)' : 'Atualizar Dados'}
                    </button>
                    {cacheStatus === 'loaded_from_cache' && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-600 bg-amber-100 rounded-md dark:text-amber-400 dark:bg-amber-900/30">
                            <Clock className="h-3 w-3" />
                            Cache
                        </span>
                    )}
                    {cacheStatus === 'loaded_from_api' && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-md dark:text-green-400 dark:bg-green-900/30">
                            <TrendingUp className="h-3 w-3" />
                            Atualizado
                        </span>
                    )}
                    <div className="w-px h-6 bg-border mx-1" />
                    <button
                        onClick={handleExportCSV}
                        disabled={processedData.length === 0}
                        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        CSV
                    </button>
                    <button
                        onClick={handleExportJSON}
                        disabled={processedData.length === 0}
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        JSON
                    </button>
                    <button
                        onClick={handleImportClick}
                        className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
                    >
                        <Upload className="h-4 w-4" />
                        Importar
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.json"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Quantidade de Dias</p>
                            <p className="text-xl font-bold">{stats.totalRecords}</p>
                        </div>
                        <Activity className="h-8 w-8 text-blue-500 opacity-20" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Volume Acumulado</p>
                            <p className="text-xl font-bold">{formatCurrency(stats.totalVolume)}</p>
                        </div>
                        <DollarSign className="h-8 w-8 text-green-500 opacity-20" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Volume Médio (Dia)</p>
                            <p className="text-xl font-bold">{formatCurrency(stats.avgVolume)}</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-yellow-500 opacity-20" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Pico de Volume</p>
                            <p className="text-xl font-bold">{formatCurrency(stats.maxVolume)}</p>
                        </div>
                        <TrendingDown className="h-8 w-8 text-red-500 opacity-20" />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader title="Filtros de Análise" description="Configure os parâmetros da consulta e filtros de exibição" />
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium">Símbolo</label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isMultiAssetMode}
                                        onChange={(e) => setIsMultiAssetMode(e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <span className="text-[11px] text-muted-foreground">Multi-Ativo</span>
                                </label>
                            </div>
                            <div className="relative" ref={symbolRef}>
                                <div
                                    className="flex min-h-9 w-full flex-wrap gap-1 items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                    onClick={() => setIsSymbolOpen(!isSymbolOpen)}
                                >
                                    <div className="flex flex-wrap gap-1 flex-1">
                                        {isMultiAssetMode ? (
                                            selectedSymbols.length > 0 ? (
                                                selectedSymbols.map(sym => {
                                                    const sData = availableSymbols.find(s => s.symbol === sym) || { name: sym };
                                                    return (
                                                        <span key={sym} className="inline-flex items-center rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                                                            {sData.name}
                                                        </span>
                                                    );
                                                })
                                            ) : (
                                                <span className="text-muted-foreground">Selecione ativos</span>
                                            )
                                        ) : (
                                            <span className="truncate">
                                                {currentSymbolData.name} ({currentSymbolData.baseAsset})
                                            </span>
                                        )}
                                    </div>
                                    <Search className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                                </div>

                                {isSymbolOpen && (
                                    <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in zoom-in-95">
                                        <div className="sticky top-0 z-10 bg-popover pb-1">
                                            <div className="flex items-center border-b border-border px-2">
                                                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                <input
                                                    className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                                    placeholder="Pesquisar ativo..."
                                                    value={symbolSearch}
                                                    onChange={(e) => setSymbolSearch(e.target.value)}
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        <div className="pt-1">
                                            {filteredSymbols.length > 0 ? (
                                                (() => {
                                                    let lastCategory = '';
                                                    return filteredSymbols.map((s) => {
                                                        const isSelected = isMultiAssetMode
                                                            ? selectedSymbols.includes(s.symbol)
                                                            : symbol === s.symbol;

                                                        const showHeader = s.category !== lastCategory;
                                                        lastCategory = s.category;
                                                        const isCollapsed = collapsedCategories.has(s.category);

                                                        return (
                                                            <div key={s.symbol}>
                                                                {showHeader && (
                                                                    <div
                                                                        className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/40 mt-1 first:mt-0 flex items-center justify-between cursor-pointer hover:bg-muted/60 transition-colors"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setCollapsedCategories(prev => {
                                                                                const next = new Set(prev);
                                                                                if (next.has(s.category)) next.delete(s.category);
                                                                                else next.add(s.category);
                                                                                return next;
                                                                            });
                                                                        }}
                                                                    >
                                                                        <span>
                                                                            {s.category === 'Perpetual' ? 'Perpetuais (Sem Vencimento)' :
                                                                                s.category === 'Futures' ? 'Futuros (Com Vencimento)' : 'Mercado Spot'}
                                                                        </span>
                                                                        {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                                                                    </div>
                                                                )}
                                                                {!isCollapsed && (
                                                                    <div
                                                                        className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${isSelected ? 'bg-accent text-accent-foreground' : ''}`}
                                                                        onClick={() => {
                                                                            if (isMultiAssetMode) {
                                                                                setSelectedSymbols(prev =>
                                                                                    prev.includes(s.symbol)
                                                                                        ? prev.filter(sym => sym !== s.symbol)
                                                                                        : [...prev, s.symbol]
                                                                                );
                                                                            } else {
                                                                                setSymbol(s.symbol);
                                                                                setIsSymbolOpen(false);
                                                                                setSymbolSearch('');
                                                                            }
                                                                        }}
                                                                    >
                                                                        <div className="flex flex-col flex-1">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-medium">{s.name}</span>
                                                                                {(s.marketCap ?? 0) > 0 && (
                                                                                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded-full font-semibold">
                                                                                        ${((s.marketCap ?? 0) >= 1e12 ? ((s.marketCap ?? 0) / 1e12).toFixed(1) + 'T' :
                                                                                            (s.marketCap ?? 0) >= 1e9 ? ((s.marketCap ?? 0) / 1e9).toFixed(1) + 'B' :
                                                                                                (s.marketCap ?? 0) >= 1e6 ? ((s.marketCap ?? 0) / 1e6).toFixed(1) + 'M' :
                                                                                                    ((s.marketCap ?? 0) / 1e3).toFixed(0) + 'k')}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span className="text-[10px] text-muted-foreground">{s.symbol}</span>
                                                                        </div>
                                                                        {isMultiAssetMode && isSelected && (
                                                                            <div className="h-2 w-2 rounded-full bg-primary mr-1"></div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    });
                                                })()
                                            ) : (
                                                <div className="py-6 text-center text-sm text-muted-foreground">
                                                    Nenhum ativo encontrado.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Período</label>
                            <select
                                value={months}
                                onChange={(e) => setMonths(Number(e.target.value))}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value={1}>Último Mês</option>
                                <option value={3}>3 Meses</option>
                                <option value={6}>6 Meses</option>
                                <option value={12}>12 Meses</option>
                                <option value={24}>2 Anos</option>
                                <option value={36}>3 Anos</option>
                                <option value={48}>4 Anos</option>
                                <option value={120}>10 Anos</option>
                                <option value={0}>Máximo Disponível</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Valor Mínimo ($)</label>
                            <input
                                type="number"
                                value={amountMin}
                                onChange={(e) => setAmountMin(e.target.value)}
                                placeholder="Ex: 1000000"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Valor Máximo ($)</label>
                            <input
                                type="number"
                                value={amountMax}
                                onChange={(e) => setAmountMax(e.target.value)}
                                placeholder="Ex: 50000000"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Atualizar Preço (segundos)</label>
                            <input
                                type="number"
                                value={priceRefreshInterval}
                                onChange={(e) => setPriceRefreshInterval(Number(e.target.value))}
                                placeholder="30"
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            />
                            <p className="text-[10px] text-muted-foreground">Tempo para atualizar a linha vermelha (0 para parar)</p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-border">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Lado da Liquidação</label>
                            <div className="flex gap-2">
                                {(['all', 'long', 'short'] as const).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setSide(s)}
                                        className={`flex-1 h-9 rounded-md text-xs font-semibold capitalize transition-all ${side === s
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:bg-accent'
                                            }`}
                                    >
                                        {s === 'all' ? 'Ambos' : s === 'long' ? 'Comprados' : 'Vendidos'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Unidade na Tooltip</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setTooltipCurrency('usd')}
                                    className={`flex-1 h-9 rounded-md text-xs font-semibold transition-all ${tooltipCurrency === 'usd'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-accent'
                                        }`}
                                >
                                    Dólar (USD)
                                </button>
                                <button
                                    onClick={() => setTooltipCurrency('btc')}
                                    className={`flex-1 h-9 rounded-md text-xs font-semibold transition-all ${tooltipCurrency === 'btc'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-accent'
                                        }`}
                                    title="Mostra o volume equivalente em BTC baseado no preço da liquidação"
                                >
                                    Bitcoin (BTC)
                                </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Formato dos volumes na dica (tooltip)</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Agrupar Por</label>
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value as 'none' | 'long' | 'short' | 'combined' | 'stacked')}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="none">Todos (Long + Short)</option>
                                <option value="long">Apenas Long</option>
                                <option value="short">Apenas Short</option>
                                <option value="combined">Combinado (Empilhado)</option>
                                <option value="stacked">Agrupado (1 Cor)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Orientação do Gráfico</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setChartHorizontal(false)}
                                    className={`flex-1 h-9 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${!chartHorizontal
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-accent'
                                        }`}
                                    title="Barras verticais (preços no eixo X)"
                                >
                                    <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'flex-end' }}>
                                        <span style={{ width: 4, height: 10, background: 'currentColor', borderRadius: 1 }} />
                                        <span style={{ width: 4, height: 16, background: 'currentColor', borderRadius: 1 }} />
                                        <span style={{ width: 4, height: 8, background: 'currentColor', borderRadius: 1 }} />
                                        <span style={{ width: 4, height: 14, background: 'currentColor', borderRadius: 1 }} />
                                    </span>
                                    Vertical
                                </button>
                                <button
                                    onClick={() => setChartHorizontal(true)}
                                    className={`flex-1 h-9 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${chartHorizontal
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-accent'
                                        }`}
                                    title="Barras horizontais (preços no eixo Y)"
                                >
                                    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                                        <span style={{ width: 10, height: 4, background: 'currentColor', borderRadius: 1 }} />
                                        <span style={{ width: 16, height: 4, background: 'currentColor', borderRadius: 1 }} />
                                        <span style={{ width: 8, height: 4, background: 'currentColor', borderRadius: 1 }} />
                                        <span style={{ width: 14, height: 4, background: 'currentColor', borderRadius: 1 }} />
                                    </span>
                                    Horizontal
                                </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Alternar entre colunas e linhas</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Intervalo de Agrupamento ($)</label>
                            <input
                                type="number"
                                value={priceInterval}
                                onChange={(e) => setPriceInterval(Number(e.target.value))}
                                placeholder="0 para sem agrupamento"
                                disabled={smartIntervalEnabled || useFixedIntervalCount}
                                className={`w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring ${(smartIntervalEnabled || useFixedIntervalCount) ? 'opacity-50 cursor-not-allowed bg-muted' : ''}`}
                            />
                            <p className="text-[10px] text-muted-foreground">Útil para ver volumes por faixas de preço específicas</p>
                        </div>

                        {/* Smart Interval Controls */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium">Intervalo Adaptativo</label>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">βeta</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setSmartIntervalEnabled(!smartIntervalEnabled);
                                        if (!smartIntervalEnabled) {
                                            setUseFixedIntervalCount(false);
                                        }
                                    }}
                                    disabled={useFixedIntervalCount}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${smartIntervalEnabled ? 'bg-primary' : 'bg-muted'} ${useFixedIntervalCount ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${smartIntervalEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>
                            {smartIntervalEnabled && (
                                <div className="space-y-3 p-3 bg-muted/50 rounded-md border border-border">
                                    {/* Adaptive Scope Selection */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-foreground">Aplicar em:</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setAdaptiveScope('complete')}
                                                className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${adaptiveScope === 'complete'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                                    }`}
                                                title="Analisa densidade em todos os dados disponíveis"
                                            >
                                                Série completa
                                            </button>
                                            <button
                                                onClick={() => setAdaptiveScope('range')}
                                                className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${adaptiveScope === 'range'
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                                    }`}
                                                title="Analisa densidade apenas na faixa de preço selecionada"
                                            >
                                                Intervalo definido
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            {adaptiveScope === 'complete'
                                                ? "Série completa: analisa densidade em todos os dados."
                                                : "Intervalo definido: analisa densidade apenas na faixa de preço selecionada."}
                                        </p>
                                        {adaptiveScope === 'range' && (!priceRangeMin || !priceRangeMax) && (
                                            <p className="text-[10px] text-amber-500 flex items-center gap-1">
                                                <span>⚠️</span>
                                                <span>Defina a faixa de preço (Min - Max) abaixo para usar esta opção</span>
                                            </p>
                                        )}
                                    </div>

                                    <div className="border-t border-border pt-2" />

                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Cria intervalos dinâmicos baseados na densidade dos dados:
                                        <span className="text-green-500 font-medium"> áreas densas → intervalos menores</span>,
                                        <span className="text-blue-500 font-medium"> áreas esparsas → intervalos maiores</span>.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-medium text-muted-foreground">Sensibilidade à Densidade</label>
                                            <span className="text-xs font-semibold text-primary">{clusterDensity}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="100"
                                            step="1"
                                            value={clusterDensity}
                                            onChange={(e) => setClusterDensity(Number(e.target.value))}
                                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>1 (menos granular)</span>
                                            <span>100 (mais granular)</span>
                                        </div>
                                    </div>

                                    {/* Min/Max Interval Controls */}
                                    <div className="space-y-3 pt-2 border-t border-border">
                                        <p className="text-xs font-medium text-foreground">Limites de Intervalo</p>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            Limita o tamanho dos intervalos adaptativos
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground">Intervalo Mínimo ($)</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="100000"
                                                    step="1"
                                                    value={minInterval}
                                                    onChange={(e) => {
                                                        const value = Number(e.target.value);
                                                        if (value >= 1 && value <= 100000) {
                                                            setMinInterval(value);
                                                            if (value >= maxInterval) {
                                                                setValidationError('O intervalo mínimo deve ser menor que o máximo');
                                                            } else {
                                                                setValidationError(null);
                                                            }
                                                        }
                                                    }}
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground">Intervalo Máximo ($)</label>
                                                <input
                                                    type="number"
                                                    min="2"
                                                    max="100000"
                                                    step="1"
                                                    value={maxInterval}
                                                    onChange={(e) => {
                                                        const value = Number(e.target.value);
                                                        if (value >= 2 && value <= 100000) {
                                                            setMaxInterval(value);
                                                            if (value <= minInterval) {
                                                                setValidationError('O intervalo máximo deve ser maior que o mínimo');
                                                            } else {
                                                                setValidationError(null);
                                                            }
                                                        }
                                                    }}
                                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                                />
                                            </div>
                                        </div>
                                        {validationError && (
                                            <p className="text-[10px] text-red-500">{validationError}</p>
                                        )}
                                    </div>

                                    <div className="pt-2 border-t border-border space-y-1">
                                        <p className="text-xs font-medium text-foreground">Intervalos Adaptativos</p>
                                        {(() => {
                                            const stats = getAdaptiveIntervalStats(processedData);
                                            return stats.count > 0 ? (
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground">Clusters:</span>
                                                        <span className="font-semibold text-foreground">{stats.count}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground">Intervalo mín:</span>
                                                        <span className="font-semibold text-green-500">{formatCurrency(stats.min)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground">Intervalo máx:</span>
                                                        <span className="font-semibold text-blue-500">{formatCurrency(stats.max)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground">Intervalo médio:</span>
                                                        <span className="font-semibold text-foreground">{formatCurrency(stats.avg)}</span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                                                        {stats.max > stats.min * 10
                                                            ? "✓ Alta variabilidade: áreas densas têm intervalos menores"
                                                            : "✓ Distribuição uniforme de intervalos"}
                                                    </p>
                                                </div>
                                            ) : (
                                                <p className="text-[10px] text-muted-foreground">Carregue dados para ver estatísticas</p>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Normal Distribution Controls */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium">Distribuição Normal</label>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-500 rounded">Novo</span>
                                </div>
                                <button
                                    onClick={() => setNormalDistributionEnabled(!normalDistributionEnabled)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${normalDistributionEnabled ? 'bg-purple-500' : 'bg-muted'}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${normalDistributionEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>
                            {normalDistributionEnabled && (
                                <div className="space-y-3 p-3 bg-purple-500/5 rounded-md border border-purple-500/20">
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Analisa a distribuição estatística dos preços ponderada pelo volume de liquidação.
                                        <span className="text-purple-500 font-medium"> Calcula média e desvio padrão</span> para identificar regiões de concentração.
                                    </p>

                                    {/* Scope Selection */}
                                    <div className="space-y-2 pt-2 border-t border-border/50">
                                        <label className="text-xs font-medium text-foreground">Aplicar em:</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setNormalDistScope('complete')}
                                                className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${normalDistScope === 'complete'
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                                    }`}
                                                title="Analisa distribuição em todos os dados disponíveis"
                                            >
                                                Série completa
                                            </button>
                                            <button
                                                onClick={() => setNormalDistScope('range')}
                                                className={`flex-1 h-8 rounded-md text-xs font-medium transition-all ${normalDistScope === 'range'
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                                    }`}
                                                title="Analisa distribuição apenas na faixa de preço selecionada"
                                            >
                                                Intervalo definido
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            {normalDistScope === 'complete'
                                                ? "Série completa: calcula estatísticas em todos os dados carregados."
                                                : "Intervalo definido: calcula estatísticas apenas na faixa de preço (Min - Max) definida abaixo."}
                                        </p>
                                        {normalDistScope === 'range' && (!priceRangeMin || !priceRangeMax) && (
                                            <p className="text-[10px] text-amber-500 flex items-center gap-1">
                                                <span>⚠️</span>
                                                <span>Defina a faixa de preço (Min - Max) abaixo para usar esta opção</span>
                                            </p>
                                        )}
                                    </div>

                                    {stdDevData ? (
                                        <div className="space-y-2 pt-2 border-t border-border/50">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-muted-foreground">Preço Médio (Ponderado):</span>
                                                <span className="font-semibold text-purple-500">{formatCurrency(stdDevData.mean)}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-muted-foreground">Desvio Padrão (σ):</span>
                                                <span className="font-semibold text-purple-500">{formatCurrency(stdDevData.stdDev)}</span>
                                            </div>
                                            <div className="space-y-2 pt-2">
                                                <p className="text-[10px] font-medium text-foreground">Exibir no Gráfico:</p>

                                                {/* Toggle Média */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5 bg-purple-500"></div>
                                                        <span className="text-[10px] text-muted-foreground">Linha da Média</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowMeanLine(!showMeanLine)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showMeanLine ? 'bg-purple-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showMeanLine ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±0.25σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #ec4899' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±0.25σ (20%)</span>
                                                        <span className="text-[10px] text-pink-500">{formatCurrency(stdDevData.regions.sd0_25[0])} - {formatCurrency(stdDevData.regions.sd0_25[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD0_25(!showSD0_25)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD0_25 ? 'bg-pink-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD0_25 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±0.5σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #06b6d4' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±0.5σ (38%)</span>
                                                        <span className="text-[10px] text-cyan-500">{formatCurrency(stdDevData.regions.sd0_5[0])} - {formatCurrency(stdDevData.regions.sd0_5[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD0_5(!showSD0_5)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD0_5 ? 'bg-cyan-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD0_5 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±1σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #10b981' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±1σ (68%)</span>
                                                        <span className="text-[10px] text-green-500">{formatCurrency(stdDevData.regions.sd1[0])} - {formatCurrency(stdDevData.regions.sd1[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD1(!showSD1)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD1 ? 'bg-green-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD1 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±2σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #f59e0b' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±2σ (95%)</span>
                                                        <span className="text-[10px] text-amber-500">{formatCurrency(stdDevData.regions.sd2[0])} - {formatCurrency(stdDevData.regions.sd2[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD2(!showSD2)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD2 ? 'bg-amber-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD2 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Toggle ±3σ */}
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-0.5" style={{ borderTop: '2px dashed #ef4444' }}></div>
                                                        <span className="text-[10px] text-muted-foreground">±3σ (99.7%)</span>
                                                        <span className="text-[10px] text-red-500">{formatCurrency(stdDevData.regions.sd3[0])} - {formatCurrency(stdDevData.regions.sd3[1])}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSD3(!showSD3)}
                                                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showSD3 ? 'bg-red-500' : 'bg-muted'}`}
                                                    >
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${showSD3 ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-muted-foreground">Carregue dados para ver estatísticas de distribuição</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Fixed Interval Count Controls */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium">Número Fixo de Intervalos</label>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-500 rounded">Novo</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setUseFixedIntervalCount(!useFixedIntervalCount);
                                        if (!useFixedIntervalCount) {
                                            setSmartIntervalEnabled(false);
                                        }
                                    }}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useFixedIntervalCount ? 'bg-green-500' : 'bg-muted'}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${useFixedIntervalCount ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                </button>
                            </div>
                            {useFixedIntervalCount && (
                                <div className="space-y-3 p-3 bg-green-500/5 rounded-md border border-green-500/20">
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Divide a faixa de preço selecionada em exatamente
                                        <span className="text-green-500 font-medium"> N intervalos de tamanho igual</span>.
                                        Defina a faixa de preço (Min - Max) abaixo.
                                    </p>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-medium text-muted-foreground">Quantidade de Intervalos</label>
                                            <span className="text-xs font-semibold text-green-500">{fixedIntervalCount}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="500"
                                            step="1"
                                            value={fixedIntervalCount}
                                            onChange={(e) => setFixedIntervalCount(Number(e.target.value))}
                                            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-green-500"
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>1</span>
                                            <span>250</span>
                                            <span>500</span>
                                        </div>
                                        {/* Direct number input for exact value */}
                                        <div className="pt-2 border-t border-border/50">
                                            <label className="text-[10px] text-muted-foreground">Valor exato:</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="500"
                                                step="1"
                                                value={fixedIntervalCount}
                                                onChange={(e) => {
                                                    const value = Number(e.target.value);
                                                    if (value >= 1 && value <= 500) {
                                                        setFixedIntervalCount(value);
                                                    }
                                                }}
                                                className="w-full h-8 mt-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-green-500/50"
                                            />
                                        </div>
                                    </div>
                                    {(!priceRangeMin || !priceRangeMax) && (
                                        <p className="text-[10px] text-amber-500 flex items-center gap-1">
                                            <span>⚠️</span>
                                            <span>Defina a faixa de preço (Min - Max) abaixo para usar esta opção</span>
                                        </p>
                                    )}
                                    <div className="pt-2 border-t border-border/50 space-y-1">
                                        <p className="text-xs font-medium text-foreground">Intervalos Fixos</p>
                                        {processedData.length > 0 ? (
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[10px]">
                                                    <span className="text-muted-foreground">Total de barras:</span>
                                                    <span className="font-semibold text-green-500">{processedData.length}</span>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-1 italic">
                                                    {processedData.length === fixedIntervalCount
                                                        ? "✓ Exatamente o número solicitado de intervalos"
                                                        : `✓ Distribuição uniforme em ${fixedIntervalCount} faixas de preço`}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-muted-foreground">Carregue dados para ver estatísticas</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Line Styles Configuration */}
                        <div className="space-y-3 border-t border-border pt-4 mt-4">
                            <label className="text-sm font-medium">Estilo das Linhas de Grade</label>
                            <div className="space-y-2">
                                <label className="text-[10px] text-muted-foreground">Intervalo das Linhas ($)</label>
                                <input
                                    type="number"
                                    min="100"
                                    step="100"
                                    value={gridLineInterval}
                                    onChange={(e) => setGridLineInterval(Number(e.target.value))}
                                    placeholder="Ex: 1000"
                                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Cor</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={lineStyles.thousandLines.color}
                                            onChange={(e) => setLineStyles(prev => ({
                                                ...prev,
                                                thousandLines: { ...prev.thousandLines, color: e.target.value }
                                            }))}
                                            className="w-8 h-8 rounded cursor-pointer"
                                        />
                                        <span className="text-xs text-muted-foreground">{lineStyles.thousandLines.color}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Espessura</label>
                                    <input
                                        type="number"
                                        min="0.5"
                                        max="10"
                                        step="0.5"
                                        value={lineStyles.thousandLines.width}
                                        onChange={(e) => setLineStyles(prev => ({
                                            ...prev,
                                            thousandLines: { ...prev.thousandLines, width: Number(e.target.value) }
                                        }))}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Traço</label>
                                    <select
                                        value={lineStyles.thousandLines.dash?.join(',') || 'solid'}
                                        onChange={(e) => setLineStyles(prev => ({
                                            ...prev,
                                            thousandLines: {
                                                ...prev.thousandLines,
                                                dash: e.target.value === 'solid' ? [] : e.target.value.split(',').map(Number)
                                            }
                                        }))}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="solid">Sólido</option>
                                        <option value="3,3">Tracejado</option>
                                        <option value="5,5">Tracejado Longo</option>
                                        <option value="10,5">Ponto-Tracejado</option>
                                        <option value="2,2">Pontilhado</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 border-t border-border pt-4">
                            <label className="text-sm font-medium">Estilo da Linha de Cotação BTC</label>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Cor</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={lineStyles.btcQuoteLine.color}
                                            onChange={(e) => setLineStyles(prev => ({
                                                ...prev,
                                                btcQuoteLine: { ...prev.btcQuoteLine, color: e.target.value }
                                            }))}
                                            className="w-8 h-8 rounded cursor-pointer"
                                        />
                                        <span className="text-xs text-muted-foreground">{lineStyles.btcQuoteLine.color}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Espessura</label>
                                    <input
                                        type="number"
                                        min="0.5"
                                        max="10"
                                        step="0.5"
                                        value={lineStyles.btcQuoteLine.width}
                                        onChange={(e) => setLineStyles(prev => ({
                                            ...prev,
                                            btcQuoteLine: { ...prev.btcQuoteLine, width: Number(e.target.value) }
                                        }))}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Traço</label>
                                    <select
                                        value={lineStyles.btcQuoteLine.dash?.join(',') || 'solid'}
                                        onChange={(e) => setLineStyles(prev => ({
                                            ...prev,
                                            btcQuoteLine: {
                                                ...prev.btcQuoteLine,
                                                dash: e.target.value === 'solid' ? [] : e.target.value.split(',').map(Number)
                                            }
                                        }))}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="solid">Sólido</option>
                                        <option value="3,3">Tracejado</option>
                                        <option value="5,5">Tracejado Longo</option>
                                        <option value="10,5">Ponto-Tracejado</option>
                                        <option value="2,2">Pontilhado</option>
                                    </select>
                                </div>
                            </div>
                            <button
                                onClick={() => setLineStyles(defaultLineStyles)}
                                className="w-full h-8 rounded-md bg-muted text-xs text-muted-foreground hover:bg-accent transition-colors"
                            >
                                Restaurar Padrões
                            </button>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Taxa L/S (Min - Max)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={ratioFilter}
                                    onChange={(e) => setRatioFilter(e.target.value)}
                                    placeholder="Min"
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                                <input
                                    type="number"
                                    value={ratioFilterMax}
                                    onChange={(e) => setRatioFilterMax(e.target.value)}
                                    placeholder="Max"
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Filtrar por faixa de taxa Long/Short</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Faixa de Preço (Min - Max)</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={priceRangeMin}
                                    onChange={(e) => setPriceRangeMin(e.target.value)}
                                    placeholder="Mínimo"
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                                <input
                                    type="number"
                                    value={priceRangeMax}
                                    onChange={(e) => setPriceRangeMax(e.target.value)}
                                    placeholder="Máximo"
                                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Definir escala do eixo X do gráfico</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {status.type && (
                <div className={`p-4 rounded-md text-sm ${status.type === 'success' ? 'bg-green-500/10 text-green-500' :
                    status.type === 'error' ? 'bg-red-500/10 text-red-500' :
                        'bg-yellow-500/10 text-yellow-500'
                    }`}>
                    {status.message}
                </div>
            )}

            {processedData.length > 0 && (
                <>
                    <Card className={isResizing ? 'ring-2 ring-primary/50 transition-none' : ''}>
                        <CardHeader title="Volume de Liquidação por Preço" description="Distribuição de Longs vs Shorts" />
                        <div style={{ height: chartHeight }} className="relative">
                            <CardContent className="h-full">
                                <LiquidationChart
                                    data={chartData}
                                    formatCurrency={formatCurrency}
                                    groupBy={groupBy}
                                    currentPrice={currentPrice}
                                    priceInterval={priceInterval}
                                    lineStyles={lineStyles}
                                    gridLineInterval={gridLineInterval}
                                    stdDevData={stdDevData}
                                    showMeanLine={showMeanLine}
                                    showSD0_25={showSD0_25}
                                    showSD0_5={showSD0_5}
                                    showSD1={showSD1}
                                    showSD2={showSD2}
                                    showSD3={showSD3}
                                    horizontal={chartHorizontal}
                                    symbol={symbol}
                                    tooltipCurrency={tooltipCurrency}
                                />
                            </CardContent>

                            {/* Visual preview of the new height (ghost line) */}
                            {isResizing && (
                                <div
                                    className="absolute left-0 right-0 border-b-2 border-dashed border-primary z-50 pointer-events-none"
                                    style={{ height: previewHeight, top: 0 }}
                                >
                                    <div className="absolute bottom-0 right-0 bg-primary text-white text-[10px] px-1 rounded-tl">
                                        {previewHeight}px
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Resize handle */}
                        <div
                            onMouseDown={handleChartResizeMouseDown}
                            className="flex items-center justify-center w-full h-4 cursor-ns-resize group"
                            title="Arraste para redimensionar o gráfico"
                        >
                            <div className="flex gap-0.5 opacity-30 group-hover:opacity-80 transition-opacity">
                                {[...Array(6)].map((_, i) => (
                                    <span key={i} className="w-1 h-1 rounded-full bg-muted-foreground" />
                                ))}
                            </div>
                        </div>
                        {currentPrice && (
                            <div className="pb-4 flex justify-center">
                                <span className="text-sm font-semibold text-red-500">
                                    BTC: ${currentPrice.toLocaleString()}
                                </span>
                            </div>
                        )}
                    </Card>

                    <Card>
                        <CardHeader title="Tabela de Dados" description="Resultados detalhados da consulta" />
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
                                            <th className="px-6 py-3 text-left">Data/Preço</th>
                                            <th className="px-6 py-3 text-left">Volume Long</th>
                                            <th className="px-6 py-3 text-left">Volume Short</th>
                                            <th className="px-6 py-3 text-left">Total</th>
                                            <th className="px-6 py-3 text-left">L/S Ratio</th>
                                            <th className="px-6 py-3 text-left">Preço Médio</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {[...processedData].sort((a, b) => b.price - a.price).slice(0, 100).map((item, idx) => (
                                            <tr key={idx} className="hover:bg-muted/50 transition-colors">
                                                <td className="px-6 py-4 text-sm font-medium">
                                                    {smartIntervalEnabled || useFixedIntervalCount || priceInterval > 0
                                                        ? `Faixa $${item.price.toLocaleString()}`
                                                        : format(new Date(item.timestamp * 1000), 'dd/MM/yyyy HH:mm')}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-green-500 font-medium">{formatCurrency(item.long_volume)}</td>
                                                <td className="px-6 py-4 text-sm text-red-500 font-medium">{formatCurrency(item.short_volume)}</td>
                                                <td className="px-6 py-4 text-sm font-semibold">{formatCurrency(item.total_volume)}</td>
                                                <td className="px-6 py-4 text-sm">
                                                    <span className={item.long_short_ratio > 1 ? 'text-green-500' : item.long_short_ratio < -1 ? 'text-red-500' : ''}>
                                                        {item.long_short_ratio.toFixed(2)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-muted-foreground">{formatCurrency(item.price)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
