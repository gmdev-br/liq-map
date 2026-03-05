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
    symbol?: string;
    original_price?: number;
    symbolVolumes?: Record<string, { long: number; short: number; avgOriginalPrice: number }>;
    longLiquidationPrice?: number;
    shortLiquidationPrice?: number;
}

interface NormalizedPrice {
    close: number;
    high: number;
    low: number;
}

export interface LineStyleConfig {
    color: string;
    width: number;
    dash?: number[];
}

export interface ChartLineStyles {
    thousandLines: LineStyleConfig;
    btcQuoteLine: LineStyleConfig;
}

export const defaultLineStyles: ChartLineStyles = {
    thousandLines: { color: '#fbff00', width: 1, dash: [] },
    btcQuoteLine: { color: '#ff0000', width: 3, dash: [5, 5] },
};

interface LiquidationChartProps {
    data: HistoricalLiquidation[];
    formatCurrency: (value: number) => string;
    groupBy?: 'none' | 'long' | 'short' | 'combined' | 'stacked' | 'delta';
    currentPrice?: number | null;
    priceInterval: number;
    lineStyles?: ChartLineStyles;
    gridLineInterval?: number;
    stdDevData?: { mean: number; stdDev: number; regions: { sd0_25: [number, number]; sd0_5: [number, number]; sd1: [number, number]; sd2: [number, number]; sd3: [number, number] } } | null;
    showMeanLine?: boolean;
    showSD0_25?: boolean;
    showSD0_5?: boolean;
    showSD1?: boolean;
    showSD2?: boolean;
    showSD3?: boolean;
    horizontal?: boolean;
    symbol: string;
    tooltipCurrency: 'usd' | 'btc';
    liquidationZonesEnabled?: boolean;
    liquidationZonesPercent?: number;
    liquidationZonesInterval?: number;
    liquidationZonesColor?: string;
    liquidationZonesColorByDelta?: boolean;
    liquidationZonesLongColor?: string;
    liquidationZonesShortColor?: string;
}

const LiquidationChart = memo(function LiquidationChart({
    data, formatCurrency, groupBy = 'none', currentPrice, priceInterval,
    lineStyles = defaultLineStyles, gridLineInterval = 1000, stdDevData,
    showMeanLine = true, showSD0_25 = false, showSD0_5 = false, showSD1 = true, showSD2 = true, showSD3 = true,
    horizontal = false, symbol, tooltipCurrency = 'usd',
    liquidationZonesEnabled = false, liquidationZonesPercent = 1.0, liquidationZonesInterval = 1000,
    liquidationZonesColor = '#f59e0b', liquidationZonesColorByDelta = false,
    liquidationZonesLongColor = '#10b981', liquidationZonesShortColor = '#ef4444',
}: Omit<LiquidationChartProps, 'formatCurrency'> & { formatCurrency: (v: number) => string }) {
    const chartRef = useRef<ReactECharts>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [clickedIndex, setClickedIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);
    const isInteractingRef = useRef(false);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const zoomKeys = useMemo(() => ({ start: `liquidation_chart_zoom_start_${symbol}`, end: `liquidation_chart_zoom_end_${symbol}` }), [symbol]);

    const debouncedSaveZoom = useMemo(() => (start: string, end: string) => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            localStorage.setItem(zoomKeys.start, start);
            localStorage.setItem(zoomKeys.end, end);
        }, 300);
    }, [zoomKeys]);

    const resetZoom = useCallback(() => {
        if (chartRef.current) {
            const chart = chartRef.current.getEchartsInstance();
            chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
            localStorage.removeItem(zoomKeys.start);
            localStorage.removeItem(zoomKeys.end);
        }
    }, [zoomKeys]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (clickedIndex !== null && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setClickedIndex(null);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [clickedIndex]);

    useEffect(() => () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); }, []);

    const sortedData = useMemo(() => [...data].sort((a, b) => a.price - b.price), [data]);

    const yMax = useMemo(() => {
        if (sortedData.length === 0) return 0;
        const maxVol = groupBy === 'delta'
            ? Math.max(...sortedData.map(d => Math.abs(d.long_volume - d.short_volume)))
            : Math.max(...sortedData.map(d => d.long_volume + d.short_volume));
        return Math.max(1, maxVol * 1.1);
    }, [sortedData, groupBy]);

    const labels = useMemo(() => sortedData.map(d => d.price), [sortedData]);

    const formatTooltipVolume = useCallback((value: number, referencePrice: number) => {
        if (tooltipCurrency === 'btc') {
            const btcValue = referencePrice > 0 ? value / referencePrice : 0;
            return `₿${btcValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        const absValue = Math.abs(value);
        let formatted = '';
        if (absValue >= 1e9) formatted = (value / 1e9).toFixed(2) + 'B';
        else if (absValue >= 1e6) formatted = (value / 1e6).toFixed(2) + 'M';
        else if (absValue >= 1e3) formatted = (value / 1e3).toFixed(1) + 'k';
        else formatted = value.toFixed(2);
        return `$${formatted}`;
    }, [tooltipCurrency]);

    const [brushedVolumes, setBrushedVolumes] = useState<{ long: number; short: number; total: number } | null>(null);

    // OPTIMIZATION 1: Pre-calculate zone volumes using Map for O(n) instead of O(n²)
    const zoneVolumesMap = useMemo(() => {
        if (!liquidationZonesEnabled || sortedData.length === 0 || liquidationZonesInterval <= 0) {
            return new Map<number, { volume: number; long: number; short: number }>();
        }
        const map = new Map<number, { volume: number; long: number; short: number }>();
        const zonePercent = liquidationZonesPercent / 100;
        for (const item of sortedData) {
            const zoneKey = Math.floor(item.price / liquidationZonesInterval);
            const roundPrice = zoneKey * liquidationZonesInterval;
            const zoneMin = roundPrice * (1 - zonePercent);
            const zoneMax = roundPrice * (1 + zonePercent);
            if (item.price >= zoneMin && item.price <= zoneMax) {
                const existing = map.get(zoneKey) || { volume: 0, long: 0, short: 0 };
                existing.long += item.long_volume;
                existing.short += item.short_volume;
                existing.volume += item.long_volume + item.short_volume;
                map.set(zoneKey, existing);
            }
        }
        return map;
    }, [sortedData, liquidationZonesEnabled, liquidationZonesInterval, liquidationZonesPercent]);

    // OPTIMIZATION 2: Pre-compute price -> index Map for O(1) lookup
    const priceIndexMap = useMemo(() => {
        const epsilon = 0.001;
        const map = new Map<number, number>();
        labels.forEach((price, idx) => {
            const key = Math.round(price / epsilon);
            if (!map.has(key)) map.set(key, idx);
        });
        return map;
    }, [labels]);

    // OPTIMIZATION 3: Separate useMemo for markLines and markAreas
    const { markLines, markAreas } = useMemo(() => {
        const markLines: any[] = [];
        const markAreas: any[] = [];
        const epsilon = 0.001;

        const findClosestLabelIndex = (target: number): number => {
            if (labels.length === 0) return 0;
            const targetKey = Math.round(target / epsilon);
            if (priceIndexMap.has(targetKey)) return priceIndexMap.get(targetKey)!;
            let left = 0, right = labels.length - 1, closestIdx = 0, minDiff = Math.abs(labels[0] - target);
            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const diff = Math.abs(labels[mid] - target);
                if (diff < minDiff) { minDiff = diff; closestIdx = mid; }
                if (labels[mid] < target) left = mid + 1;
                else if (labels[mid] > target) right = mid - 1;
                else return mid;
            }
            if (closestIdx > 0 && Math.abs(labels[closestIdx - 1] - target) < minDiff) closestIdx--;
            if (closestIdx < labels.length - 1 && Math.abs(labels[closestIdx + 1] - target) < Math.abs(labels[closestIdx] - target)) closestIdx++;
            return closestIdx;
        };

        const effectiveGridInterval = Math.max(gridLineInterval, 100);
        if (effectiveGridInterval > 0 && sortedData.length > 0) {
            const minP = sortedData[0].price, maxP = sortedData[sortedData.length - 1].price;
            const first = Math.ceil(minP / effectiveGridInterval) * effectiveGridInterval;
            const last = Math.floor(maxP / effectiveGridInterval) * effectiveGridInterval;
            for (let m = first; m <= last; m += effectiveGridInterval) {
                const idx = findClosestLabelIndex(m);
                markLines.push({ xAxis: horizontal ? undefined : idx, yAxis: horizontal ? idx : undefined, lineStyle: { color: lineStyles.thousandLines.color, width: lineStyles.thousandLines.width, type: 'solid' }, label: { show: false }, tooltip: { show: false } });
            }
        }

        const effectiveCurrentPrice = currentPrice ?? (sortedData.length > 0 ? (sortedData[0].price + sortedData[sortedData.length - 1].price) / 2 : null);
        if (effectiveCurrentPrice !== null) {
            const idx = findClosestLabelIndex(effectiveCurrentPrice);
            markLines.push({ xAxis: horizontal ? undefined : idx, yAxis: horizontal ? idx : undefined, lineStyle: { color: lineStyles.btcQuoteLine.color, width: lineStyles.btcQuoteLine.width, type: 'dashed' }, label: { show: false }, tooltip: { show: false } });
        }

        if (stdDevData && sortedData.length > 0) {
            const { mean, regions } = stdDevData;
            if (showMeanLine) {
                const meanIdx = findClosestLabelIndex(mean);
                markLines.push({ xAxis: horizontal ? undefined : meanIdx, yAxis: horizontal ? meanIdx : undefined, lineStyle: { color: '#8b5cf6', width: 2, type: 'solid' }, label: { show: false }, tooltip: { show: false } });
            }
            const addSD = (pMin: number, pMax: number, color: string, opacity: number = 0.05) => {
                if (pMin > 0 && pMax > 0) {
                    const pMinIdx = findClosestLabelIndex(pMin), pMaxIdx = findClosestLabelIndex(pMax);
                    markLines.push({ xAxis: horizontal ? undefined : pMinIdx, yAxis: horizontal ? pMinIdx : undefined, lineStyle: { color, width: 1.5, type: 'dashed' }, label: { show: false }, tooltip: { show: false } });
                    markLines.push({ xAxis: horizontal ? undefined : pMaxIdx, yAxis: horizontal ? pMaxIdx : undefined, lineStyle: { color, width: 1.5, type: 'dashed' }, label: { show: false }, tooltip: { show: false } });
                    markAreas.push([{ name: 'SD Zone', xAxis: horizontal ? undefined : pMinIdx, yAxis: horizontal ? pMinIdx : undefined, itemStyle: { color, opacity } }, { xAxis: horizontal ? undefined : pMaxIdx, yAxis: horizontal ? pMaxIdx : undefined }]);
                }
            };
            if (showSD0_25) addSD(regions.sd0_25[0], regions.sd0_25[1], '#ec4899', 0.08);
            if (showSD0_5) addSD(regions.sd0_5[0], regions.sd0_5[1], '#06b6d4', 0.07);
            if (showSD1) addSD(regions.sd1[0], regions.sd1[1], '#10b981', 0.06);
            if (showSD2) addSD(regions.sd2[0], regions.sd2[1], '#f59e0b', 0.05);
            if (showSD3) addSD(regions.sd3[0], regions.sd3[1], '#ef4444', 0.04);
        }

        if (liquidationZonesEnabled && sortedData.length > 0 && liquidationZonesInterval > 0) {
            const minPrice = sortedData[0].price, maxPrice = sortedData[sortedData.length - 1].price;
            const firstMultiple = Math.ceil(minPrice / liquidationZonesInterval) * liquidationZonesInterval;
            const lastMultiple = Math.floor(maxPrice / liquidationZonesInterval) * liquidationZonesInterval;
            const totalVolume = sortedData.reduce((sum, d) => sum + d.long_volume + d.short_volume, 0);
            const maxZoneVolume = liquidationZonesInterval * 2;
            for (let roundPrice = firstMultiple; roundPrice <= lastMultiple; roundPrice += liquidationZonesInterval) {
                const zoneKey = Math.floor(roundPrice / liquidationZonesInterval);
                const zoneData = zoneVolumesMap.get(zoneKey);
                if (zoneData && zoneData.volume > 0) {
                    const zoneMin = roundPrice * (1 - liquidationZonesPercent / 100), zoneMax = roundPrice * (1 + liquidationZonesPercent / 100);
                    const zoneMinIdx = findClosestLabelIndex(zoneMin), zoneMaxIdx = findClosestLabelIndex(zoneMax);
                    const intensity = Math.min(zoneData.volume / Math.max(maxZoneVolume, totalVolume * 0.05), 1);
                    const opacity = 0.1 + (intensity * 0.4);
                    const zoneDelta = zoneData.long - zoneData.short;
                    const zoneColor = liquidationZonesColorByDelta ? (zoneDelta >= 0 ? liquidationZonesLongColor : liquidationZonesShortColor) : liquidationZonesColor;
                    markAreas.push([{ name: `Zone ${formatCurrency(roundPrice)}`, xAxis: horizontal ? undefined : zoneMinIdx, yAxis: horizontal ? zoneMinIdx : undefined, itemStyle: { color: zoneColor, opacity, borderWidth: 1, borderColor: zoneColor }, label: { show: true, position: 'insideTop', formatter: `${formatCurrency(roundPrice)}\n${(zoneData.volume / 1e6).toFixed(1)}M`, fontSize: 9, color: '#fff', fontWeight: 'bold' } }, { xAxis: horizontal ? undefined : zoneMaxIdx, yAxis: horizontal ? zoneMaxIdx : undefined }]);
                }
            }
        }
        return { markLines, markAreas };
    }, [labels, sortedData, horizontal, lineStyles, currentPrice, gridLineInterval, stdDevData, showMeanLine, showSD0_25, showSD0_5, showSD1, showSD2, showSD3, liquidationZonesEnabled, liquidationZonesInterval, liquidationZonesPercent, liquidationZonesColor, liquidationZonesColorByDelta, liquidationZonesLongColor, liquidationZonesShortColor, zoneVolumesMap, priceIndexMap, formatCurrency]);

    // OPTIMIZATION 4: Memoize tooltip formatter
    const tooltipFormatter = useCallback((params: any) => {
        const dataIndex = params[0].dataIndex;
        const d = sortedData[dataIndex];
        if (!d) return '';
        const title = (priceInterval > 0 || d.timestamp < 1000000000) ? `Range: ${formatCurrency(d.timestamp)} - ${formatCurrency(d.timestamp + priceInterval)}` : `Price: ${formatCurrency(d.price)} | ${new Date(d.timestamp * 1000).toLocaleDateString()}`;
        const total = d.long_volume + d.short_volume;
        const delta = d.long_volume - d.short_volume;
        const isLongDominant = delta >= 0;

        if (groupBy === 'delta') {
            let innerHtml = `<div style="min-width: 220px; font-family: 'Inter', sans-serif; background: #1e293b; color: #f1f5f9; padding: 2px;"><div style="font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.1); padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">${title}</div><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;"><span style="color: #10b981; font-weight: 600; font-size: 13px;">▲ Longs:</span><span style="font-weight: 700; font-size: 13px;">${formatTooltipVolume(d.long_volume, d.price)}</span></div><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;"><span style="color: #ef4444; font-weight: 600; font-size: 13px;">▼ Shorts:</span><span style="font-weight: 700; font-size: 13px;">${formatTooltipVolume(d.short_volume, d.price)}</span></div><div style="background: rgba(15, 23, 42, 0.5); border-radius: 6px; padding: 10px; margin-top: 10px; border: 1px solid rgba(148, 163, 184, 0.1);"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;"><span style="color: #94a3b8; font-size: 11px; font-weight: 600;">DELTA:</span><strong style="color: ${isLongDominant ? '#10b981' : '#ef4444'}; font-size: 13px;">${isLongDominant ? '+' : ''}${formatTooltipVolume(delta, d.price)}</strong></div><div style="display: flex; justify-content: space-between; align-items: center;"><span style="color: #94a3b8; font-size: 11px; font-weight: 600;">DOMINÂNCIA:</span><strong style="color: ${isLongDominant ? '#10b981' : '#ef4444'}; font-size: 13px;">${isLongDominant ? 'LONG' : 'SHORT'}</strong></div></div>`;
            if (d.symbolVolumes && Object.keys(d.symbolVolumes).length > 1) {
                innerHtml += `<div style="margin: 15px 0 8px 0; font-weight: 800; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">Detalhamento de Ativos</div><div class="tooltip-scroll-container" style="max-height: 200px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.3) transparent;">`;
                Object.entries(d.symbolVolumes).sort(([, a]: any, [, b]: any) => (b.long + b.short) - (a.long + a.short)).forEach(([symbol, vol]: [string, any]) => {
                    const assetTotal = vol.long + vol.short;
                    if (assetTotal > 0) {
                        const sName = symbol.split('USDT')[0].replace('_PERP.A', '');
                        const share = ((assetTotal / total) * 100).toFixed(0);
                        const assetDelta = vol.long - vol.short;
                        const isAssetLongDominant = assetDelta >= 0;
                        innerHtml += `<div style="margin-bottom: 10px; border-left: 3px solid ${isAssetLongDominant ? '#10b981' : '#ef4444'}; padding-left: 12px;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;"><span style="font-weight: 700; color: #f1f5f9; font-size: 12px;">${sName}</span><span style="font-size: 10px; background: ${isAssetLongDominant ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${isAssetLongDominant ? '#34d399' : '#f87171'}; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${share}%</span></div><div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 4px;"><span>Delta:</span><span style="color: ${isAssetLongDominant ? '#34d399' : '#f87171'}; font-weight: 600;">${isAssetLongDominant ? '+' : ''}${formatTooltipVolume(assetDelta, d.price)}</span></div><div style="display: flex; gap: 8px; font-size: 10px;"><span style="color: #34d399; background: rgba(52, 211, 153, 0.1); padding: 1px 4px; border-radius: 3px;">▲ ${formatTooltipVolume(vol.long, d.price)}</span><span style="color: #f87171; background: rgba(248, 113, 113, 0.1); padding: 1px 4px; border-radius: 3px;">▼ ${formatTooltipVolume(vol.short, d.price)}</span></div></div>`;
                    }
                });
                innerHtml += `</div>`;
            }
            return innerHtml + '</div>';
        }

        let innerHtml = `<div style="min-width: 220px; font-family: 'Inter', sans-serif; background: #1e293b; color: #f1f5f9; padding: 2px;"><div style="font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.1); padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">${title}</div><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;"><span style="color: #10b981; font-weight: 600; font-size: 13px;">▲ Longs:</span><span style="font-weight: 700; font-size: 13px;">${formatTooltipVolume(d.long_volume, d.price)}</span></div><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;"><span style="color: #ef4444; font-weight: 600; font-size: 13px;">▼ Shorts:</span><span style="font-weight: 700; font-size: 13px;">${formatTooltipVolume(d.short_volume, d.price)}</span></div><div style="background: rgba(15, 23, 42, 0.5); border-radius: 6px; padding: 10px; margin-top: 10px; border: 1px solid rgba(148, 163, 184, 0.1);"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;"><span style="color: #94a3b8; font-size: 11px; font-weight: 600;">TOTAL LIQ:</span><strong style="color: #3b82f6; font-size: 13px;">${formatTooltipVolume(total, d.price)}</strong></div><div style="display: flex; justify-content: space-between; align-items: center;"><span style="color: #94a3b8; font-size: 11px; font-weight: 600;">L/S RATIO:</span><strong style="color: #f1f5f9; font-size: 13px;">${d.long_short_ratio.toFixed(2)}</strong></div></div>`;
        if (d.symbolVolumes && Object.keys(d.symbolVolumes).length > 1) {
            innerHtml += `<div style="margin: 15px 0 8px 0; font-weight: 800; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">Detalhamento de Ativos</div><div class="tooltip-scroll-container" style="max-height: 200px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: rgba(148, 163, 184, 0.3) transparent;">`;
            Object.entries(d.symbolVolumes).sort(([, a]: any, [, b]: any) => (b.long + b.short) - (a.long + a.short)).forEach(([symbol, vol]: [string, any]) => {
                const assetTotal = vol.long + vol.short;
                if (assetTotal > 0) {
                    const sName = symbol.split('USDT')[0].replace('_PERP.A', '');
                    const share = ((assetTotal / total) * 100).toFixed(0);
                    innerHtml += `<div style="margin-bottom: 8px; border-left: 2px solid #3b82f6; padding-left: 8px;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;"><span style="font-weight: 700; color: #f1f5f9; font-size: 12px;">${sName}</span><span style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${share}%</span></div><div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 2px;"><span>Volume:</span><span style="color: #cbd5e1; font-weight: 600;">${formatTooltipVolume(assetTotal, d.price)}</span></div><div style="display: flex; gap: 8px; font-size: 10px;"><span style="color: #34d399; background: rgba(52, 211, 153, 0.1); padding: 1px 4px; border-radius: 3px;">▲ ${formatTooltipVolume(vol.long, d.price)}</span><span style="color: #f87171; background: rgba(248, 113, 113, 0.1); padding: 1px 4px; border-radius: 3px;">▼ ${formatTooltipVolume(vol.short, d.price)}</span></div></div>`;
                }
            });
            innerHtml += `</div>`;
        }
        return innerHtml + '</div>';
    }, [sortedData, priceInterval, formatCurrency, formatTooltipVolume, groupBy]);

    // OPTIMIZATION 5: Separate useMemo for series data - markLine/markArea ONLY on first series
    const series = useMemo(() => {
        const hasMarkLines = markLines.length > 0;
        const hasMarkAreas = markAreas.length > 0;

        const baseSeries: any[] = groupBy === 'stacked'
            ? [{ name: 'Total Volume', type: 'bar', data: sortedData.map(d => d.long_volume + d.short_volume), barWidth: '40%', barCategoryGap: '40%', itemStyle: { color: '#3b82f6', borderRadius: horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0], borderWidth: 0 }, emphasis: { itemStyle: { shadowBlur: 4, shadowColor: 'rgba(59, 130, 246, 0.4)' } } }]
            : groupBy === 'delta'
            ? [{ name: 'Delta (Long - Short)', type: 'bar', data: sortedData.map(d => {
                const delta = d.long_volume - d.short_volume;
                const hasOnlyShort = d.short_volume > 0 && d.long_volume === 0;
                const hasOnlyLong = d.long_volume > 0 && d.short_volume === 0;
                let color;
                if (hasOnlyShort) {
                  color = '#d946ef'; // fuchsia
                } else if (hasOnlyLong) {
                  color = '#facc15'; // yellow
                } else {
                  color = delta >= 0 ? '#10b981' : '#ef4444';
                }
                return { value: Math.abs(delta), itemStyle: { color, borderRadius: horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0], borderWidth: 0 } };
              }), barWidth: '40%', barCategoryGap: '40%', emphasis: { itemStyle: { shadowBlur: 4, shadowColor: 'rgba(148, 163, 184, 0.4)' } } }]
            : [{ name: 'Longs', type: 'bar', data: sortedData.map(d => d.long_volume), barWidth: '40%', barGap: '10%', itemStyle: { color: '#10b981', borderRadius: horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0], borderWidth: 0 }, emphasis: { itemStyle: { shadowBlur: 4, shadowColor: 'rgba(16, 185, 129, 0.4)' } }, stack: groupBy === 'combined' ? 'total' : undefined }, { name: 'Shorts', type: 'bar', data: sortedData.map(d => d.short_volume), barWidth: '40%', barGap: '10%', itemStyle: { color: '#ef4444', borderRadius: horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0], borderWidth: 0 }, emphasis: { itemStyle: { shadowBlur: 4, shadowColor: 'rgba(239, 68, 68, 0.4)' } }, stack: groupBy === 'combined' ? 'total' : undefined }];

        // OPTIMIZATION: Only add markLine/markArea to the FIRST series
        if (hasMarkLines || hasMarkAreas) {
            baseSeries[0].markLine = hasMarkLines ? { symbol: ['none', 'none'], data: markLines, silent: true, animation: false } : undefined;
            baseSeries[0].markArea = hasMarkAreas ? { silent: true, data: markAreas, animation: false } : undefined;
        }
        return baseSeries;
    }, [sortedData, groupBy, horizontal, markLines, markAreas]);

    // OPTIMIZATION 6: Simplified option useMemo using pre-computed values
    const option = useMemo(() => {
        const savedStart = localStorage.getItem(zoomKeys.start);
        const savedEnd = localStorage.getItem(zoomKeys.end);
        const priceDataMap = new Map(sortedData.filter(d => groupBy === 'delta' ? Math.abs(d.long_volume - d.short_volume) > 0 : d.long_volume + d.short_volume > 0).map(d => [String(d.price), d]));

        const categoryAxis = { type: 'category' as const, data: labels.map(String), inverse: !horizontal, axisLabel: { fontSize: 10, fontWeight: 500, interval: 0, formatter: (val: string) => { const data = priceDataMap.get(val); if (!data) return ''; return `{${data.long_volume > data.short_volume ? 'long' : 'short'}|${formatCurrency(Number(val))}}`; }, rich: { long: { color: '#10b981', fontSize: 10, fontWeight: 600 }, short: { color: '#ef4444', fontSize: 10, fontWeight: 600 } } }, axisLine: { show: true, lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }, axisTick: { show: true, lineStyle: { color: 'rgba(100, 116, 139, 0.2)' }, interval: (index: number) => priceDataMap.has(String(labels[index])) }, splitLine: { show: false } };
        const valueAxis = { type: 'value' as const, min: 0, max: yMax, axisLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 500, formatter: (val: number) => formatCurrency(val) }, axisLine: { show: true, lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }, axisTick: { show: true, lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }, splitLine: { show: true, lineStyle: { color: 'rgba(100, 116, 139, 0.1)', type: 'dashed' } } };

        return {
            grid: { top: 40, right: 20, bottom: 20, left: horizontal ? 90 : 60, containLabel: true },
            tooltip: { show: true, trigger: 'axis', axisPointer: { type: 'cross', label: { backgroundColor: '#1e293b', color: '#f1f5f9', formatter: (params: any) => params.axisDimension === (horizontal ? 'y' : 'x') ? formatCurrency(Number(params.value)) : params.value.toLocaleString() } }, backgroundColor: '#1e293b', borderColor: 'rgba(71, 85, 105, 0.2)', borderWidth: 1, padding: 12, textStyle: { color: '#f8fafc', fontFamily: 'Inter, sans-serif' }, formatter: tooltipFormatter },
            legend: { show: groupBy !== 'stacked' && groupBy !== 'delta', top: 0, left: 'center', textStyle: { color: '#64748b' }, icon: 'circle' },
            toolbox: { show: true, right: 20, top: 0, feature: { brush: { type: ['rect', 'clear'], title: { rect: 'Seleção', clear: 'Limpar Seleção' } }, dataView: { show: true, readOnly: true, title: 'Ver Dados', lang: ['Visualização de Dados', 'Fechar', 'Atualizar'] }, saveAsImage: { show: true, title: 'Salvar Imagem', type: 'png' }, restore: { show: true, title: 'Reset' } }, iconStyle: { borderColor: '#64748b' } },
            brush: { toolbox: ['rect', 'clear'], xAxisIndex: horizontal ? undefined : 0, yAxisIndex: horizontal ? 0 : undefined, brushStyle: { borderWidth: 1, color: 'rgba(59, 130, 246, 0.2)', borderColor: 'rgba(59, 130, 246, 0.5)' } },
            visualMap: { show: false, min: 0, max: yMax, dimension: horizontal ? 0 : 1, inRange: { colorAlpha: [0.7, 1] } },
            xAxis: horizontal ? valueAxis : categoryAxis,
            yAxis: horizontal ? categoryAxis : valueAxis,
            dataZoom: [{ type: 'inside', xAxisIndex: horizontal ? undefined : 0, yAxisIndex: horizontal ? 0 : undefined, start: savedStart ? Number(savedStart) : 0, end: savedEnd ? Number(savedEnd) : 100 }, { type: 'slider', show: true, xAxisIndex: horizontal ? undefined : 0, yAxisIndex: horizontal ? 0 : undefined, bottom: 0, height: 20, borderColor: 'transparent', fillerColor: 'rgba(59, 130, 246, 0.1)', handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z', handleSize: '80%', handleStyle: { color: '#3b82f6', shadowBlur: 3, shadowColor: 'rgba(0, 0, 0, 0.6)', shadowOffsetX: 2, shadowOffsetY: 2 }, textStyle: { color: '#64748b' }, start: savedStart ? Number(savedStart) : 0, end: savedEnd ? Number(savedEnd) : 100 }],
            series
        };
    }, [horizontal, groupBy, labels, sortedData, yMax, zoomKeys, formatCurrency, tooltipFormatter, series]) as EChartsOption;

    const onEvents = useMemo(() => ({
        datazoom: (params: any) => {
            setTimeout(() => { isInteractingRef.current = false; }, 100);
            if (chartRef.current) {
                const chart = chartRef.current.getEchartsInstance();
                const option = chart.getOption() as any;
                debouncedSaveZoom(option.dataZoom[0].start.toString(), option.dataZoom[0].end.toString());
            }
        },
        mousedown: () => { isInteractingRef.current = true; },
        mouseup: () => { isInteractingRef.current = false; },
        click: (params: any) => {
            if (params.componentType === 'series' && params.seriesType === 'bar') {
                setTooltipPos({ x: params.event.event.offsetX, y: params.event.event.offsetY });
                setClickedIndex(params.dataIndex);
            }
        },
        brushselected: (params: any) => {
            const brushed = params.batch[0].selected;
            if (!brushed || brushed.length === 0) { setBrushedVolumes(null); return; }
            let longVol = 0, shortVol = 0;
            brushed.forEach((s: any) => { if (s.dataIndex?.length > 0) s.dataIndex.forEach((idx: number) => { const d = sortedData[idx]; if (d) { longVol += d.long_volume; shortVol += d.short_volume; } }); });
            if (longVol > 0 || shortVol > 0) setBrushedVolumes({ long: longVol, short: shortVol, total: longVol + shortVol });
            else setBrushedVolumes(null);
        }
    }), [zoomKeys, sortedData, debouncedSaveZoom]);

    const renderStickyTooltip = () => {
        if (clickedIndex === null || !tooltipPos) return null;
        const d = sortedData[clickedIndex];
        if (!d) return null;
        const title = (priceInterval > 0 || d.timestamp < 1000000000) ? `Range: ${formatCurrency(d.timestamp)} - ${formatCurrency(d.timestamp + priceInterval)}` : `Price: ${formatCurrency(d.price)} | ${new Date(d.timestamp * 1000).toLocaleDateString()}`;
        const total = d.long_volume + d.short_volume;
        return (
            <div className="absolute z-50 pointer-events-auto shadow-2xl border border-slate-700/50 rounded-lg overflow-hidden animate-in fade-in zoom-in duration-200" style={{ left: tooltipPos.x + 10, top: Math.max(10, tooltipPos.y - 100), backgroundColor: '#1e293b', color: '#f1f5f9', minWidth: '240px' }}>
                <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 border-b border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
                    <button onClick={(e) => { e.stopPropagation(); setClickedIndex(null); }} className="p-1 hover:bg-slate-800 rounded-md transition-colors"><RefreshCw className="h-3 w-3 rotate-45 text-slate-400" /></button>
                </div>
                <div className="p-3">
                    <div className="flex justify-between items-center mb-1.5"><span className="text-emerald-500 font-semibold text-xs">▲ Longs</span><span className="font-bold text-sm">{formatTooltipVolume(d.long_volume, d.price)}</span></div>
                    <div className="flex justify-between items-center mb-3"><span className="text-red-500 font-semibold text-xs">▼ Shorts</span><span className="font-bold text-sm">{formatTooltipVolume(d.short_volume, d.price)}</span></div>
                    <div className="bg-slate-950/40 rounded-md p-2.5 border border-slate-800/50">
                        <div className="flex justify-between items-center mb-1"><span className="text-slate-400 text-[10px] font-bold">TOTAL LIQ</span><span className="text-blue-400 font-bold text-xs">{formatTooltipVolume(total, d.price)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-slate-400 text-[10px] font-bold">L/S RATIO</span><span className="text-slate-200 font-bold text-xs">{d.long_short_ratio.toFixed(2)}</span></div>
                    </div>
                    {d.symbolVolumes && Object.keys(d.symbolVolumes).length > 1 && (
                        <>
                            <div className="mt-4 mb-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Detalhamento</div>
                            <div className="max-height-[180px] overflow-y-auto pr-1 custom-scrollbar" style={{ maxHeight: '180px' }}>
                                {Object.entries(d.symbolVolumes).sort(([, a]: any, [, b]: any) => (b.long + b.short) - (a.long + a.short)).map(([sSymbol, vol]: [string, any]) => {
                                    const assetTotal = vol.long + vol.short;
                                    if (assetTotal === 0) return null;
                                    const sName = sSymbol.split('USDT')[0].replace('_PERP.A', '');
                                    const share = ((assetTotal / total) * 100).toFixed(0);
                                    return (
                                        <div key={sSymbol} className="mb-2.5 border-l-2 border-blue-500/30 pl-2.5">
                                            <div className="flex justify-between items-center mb-1"><span className="font-bold text-xs">{sName}</span><span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-bold">{share}%</span></div>
                                            <div className="flex justify-between text-[11px] text-slate-400 mb-0.5"><span>Vol:</span><span className="text-slate-300 font-medium">{formatTooltipVolume(assetTotal, d.price)}</span></div>
                                            <div className="flex gap-2 text-[9px]"><span className="text-emerald-400/80">▲ {formatTooltipVolume(vol.long, d.price)}</span><span className="text-red-400/80">▼ {formatTooltipVolume(vol.short, d.price)}</span></div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div ref={containerRef} className="relative w-full h-full group/chart overflow-hidden" onClick={(e) => { if (e.target === e.currentTarget) setClickedIndex(null); }}>
            <ReactECharts ref={chartRef} option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} onEvents={onEvents} />
            {renderStickyTooltip()}
            {brushedVolumes && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-900/90 border border-blue-500/50 rounded-full shadow-2xl backdrop-blur-md z-30 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-4 text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 text-emerald-400"><TrendingUp className="h-3 w-3" />{formatTooltipVolume(brushedVolumes.long, (sortedData[0]?.price || 0))}</span>
                        <div className="w-px h-3 bg-slate-700"></div>
                        <span className="flex items-center gap-1.5 text-red-400"><TrendingDown className="h-3 w-3" />{formatTooltipVolume(brushedVolumes.short, (sortedData[0]?.price || 0))}</span>
                        <div className="w-px h-3 bg-slate-700"></div>
                        <span className="flex items-center gap-1.5 text-blue-400">Vol: {formatTooltipVolume(brushedVolumes.total, (sortedData[0]?.price || 0))}</span>
                    </div>
                </div>
            )}
            <button onClick={(e) => { e.stopPropagation(); resetZoom(); }} className="absolute top-2 left-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-background/90 hover:bg-background text-foreground rounded-lg border border-border shadow-lg opacity-0 group-hover/chart:opacity-100 transition-all z-20 backdrop-blur-sm" title="Reset Zoom & Pan"><RotateCcw className="h-3.5 w-3.5" />Reset Zoom</button>
        </div>
    );
});

export function LiquidationTest() {
    // State declarations
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('coinalyze_api_key') || 'FREE');
    const [isMultiAssetMode, setIsMultiAssetMode] = useState(() => localStorage.getItem('liquidation_test_multi_asset') === 'true');
    const [symbol, setSymbol] = useState(() => localStorage.getItem('liquidation_test_symbol') || 'BTCUSDT_PERP.A');
    const [selectedSymbols, setSelectedSymbols] = useState<string[]>(() => { const saved = localStorage.getItem('liquidation_test_selected_symbols'); return saved ? JSON.parse(saved) : ['BTCUSDT_PERP.A']; });
    const [months, setMonths] = useState(() => Number(localStorage.getItem('liquidation_test_months')) || 36);
    const [priceInterval, setPriceInterval] = useState(() => Number(localStorage.getItem('liquidation_test_price_interval')) || 20);
    const [amountMin, setAmountMin] = useState<string>(() => localStorage.getItem('liquidation_test_amount_min') || '200');
    const [amountMax, setAmountMax] = useState<string>(() => localStorage.getItem('liquidation_test_amount_max') || '');
    const [side, setSide] = useState<'all' | 'long' | 'short'>(() => (localStorage.getItem('liquidation_test_side') as 'all' | 'long' | 'short') || 'all');
    const [groupBy, setGroupBy] = useState<'none' | 'long' | 'short' | 'combined' | 'stacked' | 'delta'>(() => (localStorage.getItem('liquidation_test_group_by') as 'none' | 'long' | 'short' | 'combined' | 'stacked' | 'delta') || 'combined');
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
    const [adaptiveScope, setAdaptiveScope] = useState<'complete' | 'range'>(() => { const saved = localStorage.getItem('liquidation_test_adaptive_scope'); return saved === 'range' ? 'range' : 'complete'; });
    const [normalDistributionEnabled, setNormalDistributionEnabled] = useState(() => localStorage.getItem('liquidation_test_normal_distribution_enabled') === 'true');
    const [stdDevData, setStdDevData] = useState<{ mean: number; stdDev: number; regions: { sd0_25: [number, number]; sd0_5: [number, number]; sd1: [number, number]; sd2: [number, number]; sd3: [number, number] } } | null>(null);
    const [showMeanLine, setShowMeanLine] = useState(() => localStorage.getItem('liquidation_test_show_mean') !== 'false');
    const [showSD0_25, setShowSD0_25] = useState(() => localStorage.getItem('liquidation_test_show_sd0_25') === 'true');
    const [showSD0_5, setShowSD0_5] = useState(() => localStorage.getItem('liquidation_test_show_sd0_5') === 'true');
    const [showSD1, setShowSD1] = useState(() => localStorage.getItem('liquidation_test_show_sd1') !== 'false');
    const [showSD2, setShowSD2] = useState(() => localStorage.getItem('liquidation_test_show_sd2') !== 'false');
    const [showSD3, setShowSD3] = useState(() => localStorage.getItem('liquidation_test_show_sd3') !== 'false');
    const [normalDistScope, setNormalDistScope] = useState<'complete' | 'range'>(() => { const saved = localStorage.getItem('liquidation_test_normal_dist_scope'); return saved === 'range' ? 'range' : 'complete'; });
    const [liquidationZonesEnabled, setLiquidationZonesEnabled] = useState(() => localStorage.getItem('liquidation_test_zones_enabled') === 'true');
    const [liquidationZonesPercent, setLiquidationZonesPercent] = useState(() => Number(localStorage.getItem('liquidation_test_zones_percent')) || 1.0);
    const [liquidationZonesInterval, setLiquidationZonesInterval] = useState(() => Number(localStorage.getItem('liquidation_test_zones_interval')) || 1000);
    const [liquidationZonesColor, setLiquidationZonesColor] = useState(() => localStorage.getItem('liquidation_test_zones_color') || '#f59e0b');
    const [liquidationZonesColorByDelta, setLiquidationZonesColorByDelta] = useState(() => localStorage.getItem('liquidation_test_zones_color_by_delta') === 'true');
    const [liquidationZonesLongColor, setLiquidationZonesLongColor] = useState(() => localStorage.getItem('liquidation_test_zones_long_color') || '#10b981');
    const [liquidationZonesShortColor, setLiquidationZonesShortColor] = useState(() => localStorage.getItem('liquidation_test_zones_short_color') || '#ef4444');
    const [liquidationPriceType, setLiquidationPriceType] = useState<'close' | 'high_low'>(() => { const saved = localStorage.getItem('liquidation_test_price_type'); return saved === 'high_low' ? 'high_low' : 'close'; });
    const [clusterDensity, setClusterDensity] = useState(() => { const saved = Number(localStorage.getItem('liquidation_test_cluster_density')); if (saved && saved >= 1 && saved <= 10) return Math.round(saved * 10); return saved && saved >= 1 && saved <= 100 ? saved : 50; });
    const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'loading' | null }>({ message: '', type: null });
    const [minInterval, setMinInterval] = useState(() => Number(localStorage.getItem('liquidation_test_min_interval')) || 1);
    const [maxInterval, setMaxInterval] = useState(() => Number(localStorage.getItem('liquidation_test_max_interval')) || 10000);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [availableSymbols, setAvailableSymbols] = useState<{ symbol: string; name: string; baseAsset: string; rank?: number; marketCap?: number; category: 'Perpetual' | 'Futures' | 'Spot' }[]>([]);
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [symbolSearch, setSymbolSearch] = useState('');
    const [isSymbolOpen, setIsSymbolOpen] = useState(false);
    const symbolRef = useRef<HTMLDivElement>(null);
    const [lineStyles, setLineStyles] = useState<ChartLineStyles>(() => { const saved = localStorage.getItem('liquidation_test_line_styles'); if (saved) { try { return { ...defaultLineStyles, ...JSON.parse(saved) }; } catch { return defaultLineStyles; } } return defaultLineStyles; });
    const [data, setData] = useState<HistoricalLiquidation[]>([]);
    const [processedData, setProcessedData] = useState<HistoricalLiquidation[]>([]);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
    const isFetchingPriceRef = useRef(false);
    const priceMapRef = useRef<Map<string, NormalizedPrice>>(new Map());
    const sortedPricesRef = useRef<any[]>([]);
    const [shouldFetchNewData, setShouldFetchNewData] = useState(false);
    const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

    // Reset isInitialLoadComplete on mount to ensure cache is checked on every page load
    useEffect(() => {
        setIsInitialLoadComplete(false);
    }, []);
    const [cacheStatus, setCacheStatus] = useState<'idle' | 'loading_cache' | 'loaded_from_cache' | 'fetching_api' | 'loaded_from_api'>('idle');
    const { lastMessage } = useWebSocket();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(() => localStorage.getItem('liquidation_test_show_advanced') === 'true');

    // Persistence effects
    useEffect(() => { localStorage.setItem('liquidation_test_line_styles', JSON.stringify(lineStyles)); localStorage.setItem('coinalyze_api_key', apiKey); localStorage.setItem('liquidation_test_multi_asset', String(isMultiAssetMode)); localStorage.setItem('liquidation_test_symbol', symbol); localStorage.setItem('liquidation_test_selected_symbols', JSON.stringify(selectedSymbols)); localStorage.setItem('liquidation_test_tooltip_currency', tooltipCurrency); localStorage.setItem('liquidation_test_price_type', liquidationPriceType); }, [lineStyles, apiKey, isMultiAssetMode, symbol, selectedSymbols, tooltipCurrency, liquidationPriceType]);

    const filteredSymbols = useMemo(() => availableSymbols.filter(s => s.name.toLowerCase().includes(symbolSearch.toLowerCase()) || s.symbol.toLowerCase().includes(symbolSearch.toLowerCase())), [availableSymbols, symbolSearch]);
    const currentSymbolData = useMemo(() => availableSymbols.find(s => s.symbol === symbol) || { symbol, name: symbol, baseAsset: symbol.split('USDT')[0] }, [availableSymbols, symbol]);

    useEffect(() => { localStorage.setItem('liquidation_test_months', String(months)); }, [months]);
    useEffect(() => { localStorage.setItem('liquidation_test_price_interval', String(priceInterval)); }, [priceInterval]);
    useEffect(() => { localStorage.setItem('liquidation_test_amount_min', amountMin); }, [amountMin]);
    useEffect(() => { localStorage.setItem('liquidation_test_amount_max', amountMax); }, [amountMax]);
    useEffect(() => { localStorage.setItem('liquidation_test_side', side); }, [side]);
    useEffect(() => { localStorage.setItem('liquidation_test_group_by', groupBy); }, [groupBy]);
    useEffect(() => { localStorage.setItem('liquidation_test_chart_horizontal', String(chartHorizontal)); }, [chartHorizontal]);
    useEffect(() => { localStorage.setItem('liquidation_test_chart_height', String(chartHeight)); }, [chartHeight]);

    const handleChartResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY, startHeight = chartHeight;
        setIsResizing(true); setPreviewHeight(startHeight);
        let latestHeight = startHeight;
        const onMouseMove = (ev: MouseEvent) => { const delta = ev.clientY - startY; latestHeight = Math.max(200, Math.min(1200, startHeight + delta)); setPreviewHeight(latestHeight); };
        const onMouseUp = () => { setIsResizing(false); setChartHeight(latestHeight); window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
        window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
    }, [chartHeight]);

    useEffect(() => { localStorage.setItem('liquidation_test_ratio_filter', ratioFilter); }, [ratioFilter]);
    useEffect(() => { localStorage.setItem('liquidation_test_ratio_filter_max', ratioFilterMax); }, [ratioFilterMax]);
    useEffect(() => { localStorage.setItem('liquidation_test_price_range_min', priceRangeMin); }, [priceRangeMin]);
    useEffect(() => { localStorage.setItem('liquidation_test_price_range_max', priceRangeMax); }, [priceRangeMax]);
    useEffect(() => { localStorage.setItem('liquidation_test_price_refresh', String(priceRefreshInterval)); }, [priceRefreshInterval]);
    useEffect(() => { localStorage.setItem('liquidation_test_grid_line_interval', String(gridLineInterval)); }, [gridLineInterval]);
    useEffect(() => { localStorage.setItem('liquidation_test_smart_interval_enabled', String(smartIntervalEnabled)); }, [smartIntervalEnabled]);
    useEffect(() => { localStorage.setItem('liquidation_test_fixed_interval_count', String(fixedIntervalCount)); }, [fixedIntervalCount]);
    useEffect(() => { localStorage.setItem('liquidation_test_use_fixed_interval_count', String(useFixedIntervalCount)); }, [useFixedIntervalCount]);
    useEffect(() => { localStorage.setItem('liquidation_test_adaptive_scope', adaptiveScope); }, [adaptiveScope]);
    useEffect(() => { localStorage.setItem('liquidation_test_normal_distribution_enabled', String(normalDistributionEnabled)); }, [normalDistributionEnabled]);
    useEffect(() => { localStorage.setItem('liquidation_test_show_mean', String(showMeanLine)); }, [showMeanLine]);
    useEffect(() => { localStorage.setItem('liquidation_test_show_sd0_25', String(showSD0_25)); }, [showSD0_25]);
    useEffect(() => { localStorage.setItem('liquidation_test_show_sd0_5', String(showSD0_5)); }, [showSD0_5]);
    useEffect(() => { localStorage.setItem('liquidation_test_show_sd1', String(showSD1)); }, [showSD1]);
    useEffect(() => { localStorage.setItem('liquidation_test_show_sd2', String(showSD2)); }, [showSD2]);
    useEffect(() => { localStorage.setItem('liquidation_test_show_sd3', String(showSD3)); }, [showSD3]);
    useEffect(() => { localStorage.setItem('liquidation_test_normal_dist_scope', normalDistScope); }, [normalDistScope]);
    useEffect(() => { localStorage.setItem('liquidation_test_cluster_density', String(clusterDensity)); }, [clusterDensity]);
    useEffect(() => { localStorage.setItem('liquidation_test_min_interval', String(minInterval)); }, [minInterval]);
    useEffect(() => { localStorage.setItem('liquidation_test_max_interval', String(maxInterval)); }, [maxInterval]);
    useEffect(() => { localStorage.setItem('liquidation_test_zones_enabled', String(liquidationZonesEnabled)); }, [liquidationZonesEnabled]);
    useEffect(() => { localStorage.setItem('liquidation_test_zones_percent', String(liquidationZonesPercent)); }, [liquidationZonesPercent]);
    useEffect(() => { localStorage.setItem('liquidation_test_zones_interval', String(liquidationZonesInterval)); }, [liquidationZonesInterval]);
    useEffect(() => { localStorage.setItem('liquidation_test_zones_color', liquidationZonesColor); }, [liquidationZonesColor]);
    useEffect(() => { localStorage.setItem('liquidation_test_zones_color_by_delta', String(liquidationZonesColorByDelta)); }, [liquidationZonesColorByDelta]);
    useEffect(() => { localStorage.setItem('liquidation_test_zones_long_color', liquidationZonesLongColor); }, [liquidationZonesLongColor]);
    useEffect(() => { localStorage.setItem('liquidation_test_zones_short_color', liquidationZonesShortColor); }, [liquidationZonesShortColor]);
    useEffect(() => { localStorage.setItem('liquidation_test_show_advanced', String(showAdvancedSettings)); }, [showAdvancedSettings]);

    // Clear data when symbol changes to prevent filtering stale data
    useEffect(() => {
        setData([]);
        setProcessedData([]);
        setStatus({ message: 'Símbolo alterado. Clique em "Atualizar Dados" para buscar novos dados.', type: 'success' });
    }, [symbol, isMultiAssetMode, selectedSymbols.sort().join(',')]);

    const handleExportCSV = () => {
        const exportSource = processedData.length > 0 ? processedData : data;
        if (exportSource.length === 0) { setStatus({ message: 'Nenhum dado para exportar', type: 'error' }); return; }
        const filename = generateExportFilename(isMultiAssetMode ? 'MULTI' : symbol, 'csv');
        const exportData = exportSource.map(item => {
            const row: any = { data_formatada: format(new Date(item.timestamp * 1000), 'dd/MM/yyyy HH:mm:ss'), timestamp: item.timestamp, preco: item.price, volume_long: item.long_volume, volume_short: item.short_volume, volume_total: item.total_volume, ratio_ls: item.long_short_ratio.toFixed(2), ativo: item.symbol || (isMultiAssetMode ? 'MULTI' : symbol) };
            if (item.symbolVolumes) row.detalhamento = Object.entries(item.symbolVolumes).map(([s, v]: [string, any]) => `${s}(L:${v.long.toFixed(0)},S:${v.short.toFixed(0)})`).join(' | ');
            return row;
        });
        exportToCSV(exportData, filename);
        setStatus({ message: `Dados exportados para ${filename}`, type: 'success' });
    };

    const handleExportJSON = () => {
        if (data.length === 0) { setStatus({ message: 'Nenhum dado para exportar', type: 'error' }); return; }
        const filename = generateExportFilename(isMultiAssetMode ? 'MULTI' : symbol, 'json');
        const metadata = { symbol: isMultiAssetMode ? 'MULTI' : symbol, selectedSymbols: isMultiAssetMode ? selectedSymbols : [symbol], isMultiAssetMode, months, priceInterval, recordCount: data.length, exportedAt: new Date().toISOString(), schemaVersion: '2.0' };
        exportToJSON(data, metadata, filename);
        setStatus({ message: `Configurações e ${data.length} registros exportados para ${filename}`, type: 'success' });
    };

    const handleImportClick = () => { fileInputRef.current?.click(); };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return;
        try {
            setStatus({ message: 'Importando dados...', type: 'loading' });
            let importedData: any[] = [], metadata: any = null;
            if (file.name.endsWith('.json')) {
                const parsed = await importFromJSON(file);
                if (parsed.data && Array.isArray(parsed.data)) { importedData = parsed.data; metadata = parsed.metadata; } else if (Array.isArray(parsed)) { importedData = parsed; } else throw new Error('Formato JSON inválido');
            } else if (file.name.endsWith('.csv')) { importedData = await importFromCSV(file); } else { setStatus({ message: 'Formato de arquivo não suportado', type: 'error' }); return; }
            if (importedData.length === 0) { setStatus({ message: 'Arquivo não contém dados válidos', type: 'error' }); return; }
            if (metadata) { if (metadata.isMultiAssetMode !== undefined) setIsMultiAssetMode(metadata.isMultiAssetMode); if (metadata.selectedSymbols) setSelectedSymbols(metadata.selectedSymbols); if (metadata.symbol && !metadata.isMultiAssetMode) setSymbol(metadata.symbol); if (metadata.months) setMonths(metadata.months); if (metadata.priceInterval) setPriceInterval(metadata.priceInterval); }
            setData(importedData); setLastFetchTime(Date.now());
            setStatus({ message: `Importação concluída: ${importedData.length} registros${metadata ? ' (Configurações aplicadas)' : ''}`, type: 'success' });
        } catch (error: any) { console.error('Import error:', error); setStatus({ message: `Erro ao importar: ${error.message || 'Verifique o formato.'}`, type: 'error' }); }
        event.target.value = '';
    };

    const formatCurrency = useCallback((value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, []);

    const aggregateByPriceInterval = useCallback((rawData: HistoricalLiquidation[], interval: number) => {
        if (!interval || interval <= 0) return rawData.map(item => { const long = side === 'short' ? 0 : item.long_volume, short = side === 'long' ? 0 : item.short_volume, total = long + short; return { ...item, long_volume: long, short_volume: short, total_volume: total, long_short_ratio: long / (short || 1) }; }).filter(item => side === 'all' || item.total_volume > 0);
        const aggregated: Record<string, any> = {}; let minRange = Infinity, maxRange = -Infinity;
        for (const item of rawData) {
            const long = side === 'short' ? 0 : item.long_volume, short = side === 'long' ? 0 : item.short_volume, total = long + short;
            if (side !== 'all' && total === 0) continue;
            if (liquidationPriceType === 'high_low' && side === 'all') {
                if (long > 0) {
                    const longPrice = item.longLiquidationPrice || item.price || 0, longPriceRange = Math.floor(longPrice / interval) * interval;
                    minRange = Math.min(minRange, longPriceRange); maxRange = Math.max(maxRange, longPriceRange);
                    const safeR = Number(longPriceRange.toFixed(8)), safeREnd = Number((longPriceRange + interval).toFixed(8)), rangeKey = `${safeR}-${safeREnd}`;
                    if (!aggregated[rangeKey]) aggregated[rangeKey] = { priceRange: safeR, priceRangeEnd: safeREnd, long_volume: 0, short_volume: 0, total_volume: 0, count: 0, symbolVolumes: {} };
                    const agg = aggregated[rangeKey]; agg.long_volume += long; agg.total_volume += long; agg.count++;
                    if (item.symbol) { if (!agg.symbolVolumes[item.symbol]) agg.symbolVolumes[item.symbol] = { long: 0, short: 0, avgOriginalPrice: 0 }; const sv = agg.symbolVolumes[item.symbol], oldTotal = sv.long + sv.short; sv.long += long; if (sv.long + sv.short > 0 && item.original_price) sv.avgOriginalPrice = ((sv.avgOriginalPrice * oldTotal) + (item.original_price * long)) / (sv.long + sv.short); }
                }
                if (short > 0) {
                    const shortPrice = item.shortLiquidationPrice || item.price || 0, shortPriceRange = Math.floor(shortPrice / interval) * interval;
                    minRange = Math.min(minRange, shortPriceRange); maxRange = Math.max(maxRange, shortPriceRange);
                    const safeR = Number(shortPriceRange.toFixed(8)), safeREnd = Number((shortPriceRange + interval).toFixed(8)), rangeKey = `${safeR}-${safeREnd}`;
                    if (!aggregated[rangeKey]) aggregated[rangeKey] = { priceRange: safeR, priceRangeEnd: safeREnd, long_volume: 0, short_volume: 0, total_volume: 0, count: 0, symbolVolumes: {} };
                    const agg = aggregated[rangeKey]; agg.short_volume += short; agg.total_volume += short; agg.count++;
                    if (item.symbol) { if (!agg.symbolVolumes[item.symbol]) agg.symbolVolumes[item.symbol] = { long: 0, short: 0, avgOriginalPrice: 0 }; const sv = agg.symbolVolumes[item.symbol], oldTotal = sv.long + sv.short; sv.short += short; if (sv.long + sv.short > 0 && item.original_price) sv.avgOriginalPrice = ((sv.avgOriginalPrice * oldTotal) + (item.original_price * short)) / (sv.long + sv.short); }
                }
            } else {
                const price = item.price || 0, priceRange = Math.floor(price / interval) * interval;
                minRange = Math.min(minRange, priceRange); maxRange = Math.max(maxRange, priceRange);
                const safeR = Number(priceRange.toFixed(8)), safeREnd = Number((priceRange + interval).toFixed(8)), rangeKey = `${safeR}-${safeREnd}`;
                if (!aggregated[rangeKey]) aggregated[rangeKey] = { priceRange: safeR, priceRangeEnd: safeREnd, long_volume: 0, short_volume: 0, total_volume: 0, count: 0, symbolVolumes: {} };
                const agg = aggregated[rangeKey]; agg.long_volume += long; agg.short_volume += short; agg.total_volume += total; agg.count++;
                if (item.symbol) { if (!agg.symbolVolumes[item.symbol]) agg.symbolVolumes[item.symbol] = { long: 0, short: 0, avgOriginalPrice: 0 }; const sv = agg.symbolVolumes[item.symbol], oldTotal = sv.long + sv.short; sv.long += long; sv.short += short; if (sv.long + sv.short > 0 && item.original_price) sv.avgOriginalPrice = ((sv.avgOriginalPrice * oldTotal) + (item.original_price * total)) / (sv.long + sv.short); }
            }
        }
        if (minRange !== Infinity && maxRange !== -Infinity) { const steps = (maxRange - minRange) / interval; if (steps <= 50000) for (let r = minRange; r <= maxRange; r += interval) { const safeR = Number(r.toFixed(8)), safeREnd = Number((r + interval).toFixed(8)), rangeKey = `${safeR}-${safeREnd}`; if (!aggregated[rangeKey]) aggregated[rangeKey] = { priceRange: safeR, priceRangeEnd: safeREnd, long_volume: 0, short_volume: 0, total_volume: 0, count: 0, symbolVolumes: {} }; } }
        return Object.values(aggregated).map((item: any) => ({ timestamp: item.priceRange, price: item.priceRange + (item.priceRangeEnd - item.priceRange) / 2, long_volume: item.long_volume, short_volume: item.short_volume, total_volume: item.total_volume, long_short_ratio: item.long_volume >= item.short_volume ? item.long_volume / Math.max(1, item.short_volume) : -(item.short_volume / Math.max(1, item.long_volume)), symbolVolumes: item.symbolVolumes, symbol: Object.keys(item.symbolVolumes || {})[0] || '' })).sort((a: any, b: any) => a.price - b.price);
    }, [side, liquidationPriceType]);

    const aggregateByAdaptiveInterval = useCallback((rawData: HistoricalLiquidation[], density: number, userMinInterval?: number, userMaxInterval?: number): HistoricalLiquidation[] => {
        let processedData: HistoricalLiquidation[];
        if (liquidationPriceType === 'high_low' && side === 'all') {
            processedData = [];
            for (const item of rawData) { if (item.long_volume > 0) processedData.push({ ...item, price: item.longLiquidationPrice || item.price, long_volume: item.long_volume, short_volume: 0, total_volume: item.long_volume, long_short_ratio: item.long_volume }); if (item.short_volume > 0) processedData.push({ ...item, price: item.shortLiquidationPrice || item.price, long_volume: 0, short_volume: item.short_volume, total_volume: item.short_volume, long_short_ratio: -item.short_volume }); }
        } else if (liquidationPriceType === 'high_low') processedData = rawData.map(item => { const long = side === 'short' ? 0 : item.long_volume, short = side === 'long' ? 0 : item.short_volume, usePrice = side === 'long' ? (item.longLiquidationPrice || item.price) : side === 'short' ? (item.shortLiquidationPrice || item.price) : item.price; return { ...item, price: usePrice, long_volume: long, short_volume: short, total_volume: long + short, long_short_ratio: long / (short || 1) }; });
        else processedData = rawData.map(item => { const long = side === 'short' ? 0 : item.long_volume, short = side === 'long' ? 0 : item.short_volume; return { ...item, long_volume: long, short_volume: short, total_volume: long + short, long_short_ratio: long / (short || 1) }; });
        let filtered = processedData; if (side !== 'all') filtered = processedData.filter(item => item.total_volume > 0); if (filtered.length === 0) return [];
        const sortedData = [...filtered].sort((a, b) => a.price - b.price), prices = sortedData.map(d => d.price), minPrice = Math.min(...prices), maxPrice = Math.max(...prices), priceRange = maxPrice - minPrice;
        if (priceRange <= 0) return sortedData;
        const densityFactor = density / 50, minClusters = Math.max(5, Math.floor(10 * densityFactor)), maxClusters = Math.max(20, Math.floor(100 * densityFactor)), targetBaseInterval = priceRange / ((minClusters + maxClusters) / 2);
        const windowSize = Math.max(3, Math.floor(sortedData.length / (20 * densityFactor))), halfWindow = Math.floor(windowSize / 2), densityScores: number[] = new Array(sortedData.length);
        const totalVolume = sortedData.reduce((sum, d) => sum + d.total_volume, 0), avgVolumePerItem = totalVolume / sortedData.length;
        let windowVolumeSum = 0, windowStartIdx = 0, windowEndIdx = 0;
        for (let i = 0; i < sortedData.length; i++) {
            const currentWindowStart = Math.max(0, i - halfWindow), currentWindowEnd = Math.min(sortedData.length, i + halfWindow + 1);
            while (windowEndIdx < currentWindowEnd) { windowVolumeSum += sortedData[windowEndIdx].total_volume; windowEndIdx++; }
            while (windowStartIdx < currentWindowStart) { windowVolumeSum -= sortedData[windowStartIdx].total_volume; windowStartIdx++; }
            const windowDataLength = currentWindowEnd - currentWindowStart, windowPriceRange = sortedData[currentWindowEnd - 1]?.price - sortedData[currentWindowStart]?.price || 1;
            const rawDensity = (windowVolumeSum / windowDataLength) / Math.max(windowPriceRange, targetBaseInterval / 10);
            densityScores[i] = rawDensity / (avgVolumePerItem || 1);
        }
        const maxDensity = Math.max(...densityScores, 0.001), minDensity = Math.min(...densityScores), densityRange = maxDensity - minDensity || 1, normalizedDensities = densityScores.map(d => (d - minDensity) / densityRange);
        const peaks: number[] = [], peakWindow = Math.max(2, Math.floor(windowSize / 2)), deque: number[] = [];
        for (let i = 0; i < normalizedDensities.length; i++) {
            while (deque.length > 0 && deque[0] <= i - peakWindow * 2 - 1) deque.shift();
            while (deque.length > 0 && normalizedDensities[deque[deque.length - 1]] <= normalizedDensities[i]) deque.pop();
            deque.push(i);
            if (i >= peakWindow * 2) { const windowCenter = i - peakWindow, maxIdx = deque[0]; if (maxIdx === windowCenter && normalizedDensities[maxIdx] > 0.3 && (peaks.length === 0 || peaks[peaks.length - 1] !== maxIdx)) peaks.push(maxIdx); }
        }
        for (let i = normalizedDensities.length - peakWindow; i < normalizedDensities.length; i++) { if (peaks.includes(i)) continue; let isLocalMax = true; for (let j = Math.max(0, i - peakWindow); j < Math.min(normalizedDensities.length, i + peakWindow + 1); j++) if (j !== i && normalizedDensities[j] >= normalizedDensities[i]) { isLocalMax = false; break; } if (isLocalMax && normalizedDensities[i] > 0.3) peaks.push(i); }
        const calculatedMinInterval = targetBaseInterval / (2 * densityFactor), calculatedMaxInterval = targetBaseInterval * (2 / densityFactor);
        const absoluteMinInterval = userMinInterval !== undefined ? userMinInterval : 1, absoluteMaxInterval = userMaxInterval !== undefined ? userMaxInterval : 10000;
        const minInterval = Math.max(calculatedMinInterval, absoluteMinInterval), maxInterval = Math.min(calculatedMaxInterval, absoluteMaxInterval);
        const buckets: { priceStart: number; priceEnd: number; items: HistoricalLiquidation[]; targetInterval: number; }[] = [];
        let currentBucketStart = 0;
        while (currentBucketStart < sortedData.length) {
            const currentPrice = sortedData[currentBucketStart].price, currentDensity = normalizedDensities[currentBucketStart];
            const sensitivity = 3.0, densityMultiplier = 1 + (currentDensity * sensitivity);
            let adaptiveInterval = maxInterval / densityMultiplier;
            adaptiveInterval = Math.max(minInterval, Math.min(maxInterval, adaptiveInterval));
            let bucketEnd = currentBucketStart, priceStart = sortedData[currentBucketStart].price, priceEnd = priceStart + adaptiveInterval;
            while (bucketEnd < sortedData.length && sortedData[bucketEnd].price < priceEnd) bucketEnd++;
            const minItemsPerBucket = Math.max(1, Math.floor(3 / densityFactor));
            if (bucketEnd - currentBucketStart < minItemsPerBucket && bucketEnd < sortedData.length) { bucketEnd = Math.min(currentBucketStart + minItemsPerBucket, sortedData.length); priceEnd = sortedData[bucketEnd - 1].price; }
            const bucketItems = sortedData.slice(currentBucketStart, bucketEnd);
            if (bucketItems.length > 0) buckets.push({ priceStart, priceEnd, items: bucketItems, targetInterval: adaptiveInterval });
            currentBucketStart = bucketEnd;
        }
        const mergedBuckets: typeof buckets = [];
        for (let i = 0; i < buckets.length; i++) {
            const current = buckets[i];
            if (mergedBuckets.length === 0) { mergedBuckets.push({ ...current }); continue; }
            const lastMerged = mergedBuckets[mergedBuckets.length - 1], densityIndex = Math.min(currentBucketStart, normalizedDensities.length - 1), avgDensity = normalizedDensities[densityIndex] || 0;
            const isSparseArea = avgDensity < 0.3, isSmallBucket = lastMerged.items.length < 3 && current.items.length < 3, combinedSize = lastMerged.items.length + current.items.length, wouldBeReasonableSize = combinedSize <= Math.max(10, 15 / densityFactor);
            if (isSparseArea && isSmallBucket && wouldBeReasonableSize) mergedBuckets[mergedBuckets.length - 1] = { priceStart: lastMerged.priceStart, priceEnd: current.priceEnd, items: [...lastMerged.items, ...current.items], targetInterval: lastMerged.targetInterval + current.targetInterval };
            else mergedBuckets.push({ ...current });
        }
        const aggregated: HistoricalLiquidation[] = mergedBuckets.map(bucket => {
            const items = bucket.items, { totalLongVolume, totalShortVolume, weightedPriceSum } = items.reduce((acc, item) => ({ totalLongVolume: acc.totalLongVolume + item.long_volume, totalShortVolume: acc.totalShortVolume + item.short_volume, weightedPriceSum: acc.weightedPriceSum + item.price * item.total_volume }), { totalLongVolume: 0, totalShortVolume: 0, weightedPriceSum: 0 }), totalVolume = totalLongVolume + totalShortVolume, avgPrice = totalVolume > 0 ? weightedPriceSum / totalVolume : (bucket.priceStart + bucket.priceEnd) / 2;
            const symbolVolumes: Record<string, { long: number; short: number; avgOriginalPrice: number }> = {};
            items.forEach(item => { if (item.symbol) { if (!symbolVolumes[item.symbol]) symbolVolumes[item.symbol] = { long: 0, short: 0, avgOriginalPrice: 0 }; const sv = symbolVolumes[item.symbol], oldTotal = sv.long + sv.short; sv.long += item.long_volume; sv.short += item.short_volume; if (sv.long + sv.short > 0 && item.original_price) sv.avgOriginalPrice = ((sv.avgOriginalPrice * oldTotal) + (item.original_price * item.total_volume)) / (sv.long + sv.short); } });
            const bucketSymbol = Object.keys(symbolVolumes || {})[0] || '';
            return { timestamp: bucket.priceStart, price: avgPrice, long_volume: totalLongVolume, short_volume: totalShortVolume, total_volume: totalVolume, long_short_ratio: totalLongVolume >= totalShortVolume ? totalLongVolume / Math.max(1, totalShortVolume) : -(totalShortVolume / Math.max(1, totalLongVolume)), symbolVolumes, symbol: bucketSymbol };
        });
        return aggregated.sort((a, b) => a.price - b.price);
    }, [side, liquidationPriceType]);

    const aggregateByFixedCount = useCallback((rawData: HistoricalLiquidation[], targetCount: number): HistoricalLiquidation[] => {
        const validTargetCount = Math.max(1, Math.min(500, targetCount));
        let processedData: HistoricalLiquidation[];
        if (liquidationPriceType === 'high_low' && side === 'all') { processedData = []; for (const item of rawData) { if (item.long_volume > 0) processedData.push({ ...item, price: item.longLiquidationPrice || item.price, long_volume: item.long_volume, short_volume: 0, total_volume: item.long_volume, long_short_ratio: item.long_volume }); if (item.short_volume > 0) processedData.push({ ...item, price: item.shortLiquidationPrice || item.price, long_volume: 0, short_volume: item.short_volume, total_volume: item.short_volume, long_short_ratio: -item.short_volume }); } }
        else if (liquidationPriceType === 'high_low') processedData = rawData.map(item => { const long = side === 'short' ? 0 : item.long_volume, short = side === 'long' ? 0 : item.short_volume, usePrice = side === 'long' ? (item.longLiquidationPrice || item.price) : side === 'short' ? (item.shortLiquidationPrice || item.price) : item.price; return { ...item, price: usePrice, long_volume: long, short_volume: short, total_volume: long + short, long_short_ratio: long >= short ? long / Math.max(1, short) : -(short / Math.max(1, long)) }; });
        else processedData = rawData.map(item => { const long = side === 'short' ? 0 : item.long_volume, short = side === 'long' ? 0 : item.short_volume; return { ...item, long_volume: long, short_volume: short, total_volume: long + short, long_short_ratio: long >= short ? long / Math.max(1, short) : -(short / Math.max(1, long)) }; });
        let filtered = processedData; if (side !== 'all') filtered = processedData.filter(item => item.total_volume > 0); if (filtered.length === 0) return [];
        const sortedData = [...filtered].sort((a, b) => a.price - b.price), prices = sortedData.map(d => d.price), minPrice = Math.min(...prices), maxPrice = Math.max(...prices), priceRange = maxPrice - minPrice;
        if (priceRange <= 0) return sortedData;
        const intervalSize = priceRange / validTargetCount, buckets: { priceStart: number; priceEnd: number; items: HistoricalLiquidation[]; }[] = [];
        let dataIndex = 0;
        for (let i = 0; i < validTargetCount; i++) { const priceStart = minPrice + (i * intervalSize), priceEnd = minPrice + ((i + 1) * intervalSize), isLastBucket = i === validTargetCount - 1; const bucketItems: HistoricalLiquidation[] = []; while (dataIndex < sortedData.length) { const item = sortedData[dataIndex]; const priceCondition = isLastBucket ? item.price <= priceEnd : item.price < priceEnd; if (item.price >= priceStart && priceCondition) { bucketItems.push(item); dataIndex++; } else if (item.price < priceStart) dataIndex++; else break; } buckets.push({ priceStart, priceEnd, items: bucketItems }); }
        const aggregated: HistoricalLiquidation[] = buckets.map(bucket => { const items = bucket.items, { totalLongVolume, totalShortVolume, weightedPriceSum } = items.reduce((acc, item) => ({ totalLongVolume: acc.totalLongVolume + item.long_volume, totalShortVolume: acc.totalShortVolume + item.short_volume, weightedPriceSum: acc.weightedPriceSum + item.price * item.total_volume }), { totalLongVolume: 0, totalShortVolume: 0, weightedPriceSum: 0 }), totalVolume = totalLongVolume + totalShortVolume, avgPrice = totalVolume > 0 ? weightedPriceSum / totalVolume : (bucket.priceStart + bucket.priceEnd) / 2; const symbolVolumes: Record<string, { long: number; short: number; avgOriginalPrice: number }> = {}; items.forEach(item => { if (item.symbol) { if (!symbolVolumes[item.symbol]) symbolVolumes[item.symbol] = { long: 0, short: 0, avgOriginalPrice: 0 }; const sv = symbolVolumes[item.symbol], oldTotal = sv.long + sv.short; sv.long += item.long_volume; sv.short += item.short_volume; if (sv.long + sv.short > 0 && item.original_price) sv.avgOriginalPrice = ((sv.avgOriginalPrice * oldTotal) + (item.original_price * item.total_volume)) / (sv.long + sv.short); } }); const bucketSymbol = Object.keys(symbolVolumes || {})[0] || ''; return { timestamp: bucket.priceStart, price: avgPrice, long_volume: totalLongVolume, short_volume: totalShortVolume, total_volume: totalVolume, long_short_ratio: totalLongVolume >= totalShortVolume ? totalLongVolume / Math.max(1, totalShortVolume) : -(totalShortVolume / Math.max(1, totalLongVolume)), symbolVolumes, symbol: bucketSymbol }; });
        return aggregated.filter(bucket => bucket.total_volume > 0 || buckets.length <= 100).sort((a, b) => a.price - b.price);
    }, [side, liquidationPriceType]);

    const calculateSmartInterval = (rawData: HistoricalLiquidation[], density: number): number => { if (!rawData || rawData.length === 0) return 1000; const prices = rawData.map(item => item.price).filter(p => p > 0); if (prices.length === 0) return 1000; const minPrice = Math.min(...prices), maxPrice = Math.max(...prices), priceRange = maxPrice - minPrice; if (priceRange <= 0) return 1000; const minClusters = 5, maxClusters = 200, targetClusterCount = minClusters + ((density - 1) / 99) * (maxClusters - minClusters), rawInterval = priceRange / targetClusterCount; const niceNumbers = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000]; let bestInterval = niceNumbers[0], minDiff = Math.abs(rawInterval - niceNumbers[0]); for (const nice of niceNumbers) { const diff = Math.abs(rawInterval - nice); if (diff < minDiff) { minDiff = diff; bestInterval = nice; } } if (rawInterval > niceNumbers[niceNumbers.length - 1]) bestInterval = Math.ceil(rawInterval / 10000) * 10000; return bestInterval; };

    const updateCurrentPrice = async () => { if (!symbol || isFetchingPriceRef.current) return; if (lastMessage?.type === 'price' && lastMessage.data.symbol === symbol.replace('_PERP.A', '')) { const wsPriceTime = new Date(lastMessage.data.timestamp).getTime(); if (Date.now() - wsPriceTime < 10000) return; } isFetchingPriceRef.current = true; try { const response = await pricesApi.getAll({ symbol }); const priceData = response.data.data || []; if (priceData.length > 0) { const latestPrice = priceData[priceData.length - 1].price; if (latestPrice > 0) setCurrentPrice(latestPrice); } } catch (error) { console.error('Error auto-updating price:', error); } finally { isFetchingPriceRef.current = false; } };
    useEffect(() => { if (priceRefreshInterval <= 0) return; const intervalId = setInterval(updateCurrentPrice, priceRefreshInterval * 1000); return () => clearInterval(intervalId); }, [symbol, priceRefreshInterval]);

    const fetchLiquidationData = async () => {
        setStatus({ message: 'Fetching liquidation data...', type: 'loading' }); if (apiKey && apiKey !== 'FREE') localStorage.setItem('coinalyze_api_key', apiKey);
        const end = Math.floor(Date.now() / 1000), start = months === 0 ? end - (10 * 365 * 24 * 60 * 60) : end - (months * 30 * 24 * 60 * 60);
        try {
            if (isMultiAssetMode && selectedSymbols.length > 0) {
                const btcPricePromise = pricesApi.getAll({ symbol: 'BTCUSDT_PERP.A', start_date: new Date(start * 1000).toISOString(), end_date: new Date(end * 1000).toISOString() });
                const BATCH_SIZE = 3, batches = []; for (let i = 0; i < selectedSymbols.length; i += BATCH_SIZE) batches.push(selectedSymbols.slice(i, i + BATCH_SIZE));
                const liquidationResults: any[] = [];
                for (let i = 0; i < batches.length; i++) { const batch = batches[i]; if (i > 0) { setStatus({ message: `Waiting to avoid rate limits (${i + 1}/${batches.length})...`, type: 'loading' }); await new Promise(resolve => setTimeout(resolve, 3000)); } const batchSymbols = batch.join(','), res = await liquidationsApi.getAll({ symbol: batchSymbols, start_date: new Date(start * 1000).toISOString(), end_date: new Date(end * 1000).toISOString(), amount_min: 0 }); const batchData = res.data.data, groupedBySymbol = new Map<string, any[]>(); for (const item of batchData) { const sym = item.symbol; if (!groupedBySymbol.has(sym)) groupedBySymbol.set(sym, []); groupedBySymbol.get(sym)!.push(item); } for (const sym of batch) liquidationResults.push({ symbol: sym, data: groupedBySymbol.get(sym) || [] }); }
                const btcPriceRes = await btcPricePromise; return { isMulti: true, liquidations: liquidationResults, price: btcPriceRes.data.data };
            } else {
                const liqResponse = await liquidationsApi.getAll({ symbol, start_date: new Date(start * 1000).toISOString(), end_date: new Date(end * 1000).toISOString(), amount_min: 0 }), priceResponse = await pricesApi.getAll({ symbol, start_date: new Date(start * 1000).toISOString(), end_date: new Date(end * 1000).toISOString() });
                return { isMulti: false, liquidation: liqResponse.data.data, price: priceResponse.data.data };
            }
        } catch (error: any) { throw error; }
    };

    const cacheKeyBase = isMultiAssetMode ? `liquidation_multi_v3_${liquidationPriceType}_${[...selectedSymbols].sort().join('-')}_${months}` : `liquidation_v3_${liquidationPriceType}_${symbol}_${months}`;
    const { isLoading, refetch, isFromCache, clearCache } = useCacheData({ cacheKey: cacheKeyBase, fetchFn: fetchLiquidationData, ttlMinutes: 30, enabled: false, onSuccess: async (result) => { const data = result as any; if (!data) return; const priceData = Array.isArray(data.price) ? data.price : [], priceMap = new Map<string, NormalizedPrice>(), sortedPrices = [...priceData].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp)); sortedPrices.forEach((p: any) => { const ts = Number(p.timestamp), dateKey = new Date(ts * 1000).toISOString().split('T')[0]; priceMap.set(dateKey, { close: p.price ?? p.close ?? 0, high: p.high ?? p.price ?? 0, low: p.low ?? p.price ?? 0 }); }); priceMapRef.current = priceMap; sortedPricesRef.current = sortedPrices; const binarySearchClosest = (sortedPrices: any[], targetTimestamp: number): any | null => { let left = 0, right = sortedPrices.length - 1, closest = sortedPrices[0], minDiff = Infinity; while (left <= right) { const mid = Math.floor((left + right) / 2), diff = Math.abs(Number(sortedPrices[mid].timestamp) - targetTimestamp); if (diff < minDiff) { minDiff = diff; closest = sortedPrices[mid]; } if (Number(sortedPrices[mid].timestamp) < targetTimestamp) left = mid + 1; else right = mid - 1; } return closest; }; const getNormalizedPrice = (timestamp: number, itemPrice: number): NormalizedPrice => { const dateKey = new Date(timestamp * 1000).toISOString().split('T')[0]; let basePrice = priceMap.get(dateKey); if (basePrice === undefined && sortedPrices.length > 0) { const nearest = binarySearchClosest(sortedPrices, timestamp); if (nearest) { const minDiff = Math.abs(Number(nearest.timestamp) - timestamp); if (minDiff <= 7 * 24 * 60 * 60) basePrice = { close: nearest.price ?? nearest.close ?? itemPrice, high: nearest.high ?? nearest.price ?? itemPrice, low: nearest.low ?? nearest.price ?? itemPrice }; } } if (basePrice === undefined || basePrice.close === 0) basePrice = { close: itemPrice, high: itemPrice, low: itemPrice }; return basePrice; }; const mapLiquidationItem = (item: any, symbolLabel?: string): HistoricalLiquidation => { const timestamp = Number(item.timestamp), itemPrice = Number(item.price), normalizedPrice = getNormalizedPrice(timestamp, itemPrice), longVolume = item.long_volume !== undefined ? item.long_volume : (item.side === 'long' ? item.amount : 0), shortVolume = item.short_volume !== undefined ? item.short_volume : (item.side === 'short' ? item.amount : 0), finalPrice = liquidationPriceType === 'high_low' ? normalizedPrice.close : normalizedPrice.close, longLiquidationPrice = liquidationPriceType === 'high_low' ? normalizedPrice.low : normalizedPrice.close, shortLiquidationPrice = liquidationPriceType === 'high_low' ? normalizedPrice.high : normalizedPrice.close; return { timestamp, long_volume: longVolume, short_volume: shortVolume, total_volume: item.amount, long_short_ratio: longVolume >= shortVolume ? longVolume / Math.max(1, shortVolume) : -(shortVolume / Math.max(1, longVolume)), price: finalPrice, symbol: symbolLabel, original_price: itemPrice, longLiquidationPrice, shortLiquidationPrice }; }; let allMapped: HistoricalLiquidation[] = []; if (data.isMulti) data.liquidations.forEach((liqGroup: any) => { if (Array.isArray(liqGroup.data)) allMapped = allMapped.concat(liqGroup.data.map((item: any) => mapLiquidationItem(item, liqGroup.symbol))); }); else if (Array.isArray(data.liquidation)) allMapped = data.liquidation.map((item: any) => mapLiquidationItem(item, symbol)); allMapped.sort((a, b) => a.timestamp - b.timestamp); setData(allMapped); if (priceData.length > 0) setCurrentPrice(Number(priceData[priceData.length - 1].price || 0)); setLastFetchTime(Date.now()); setCacheStatus('loaded_from_api'); setStatus({ message: `Dados atualizados da API (${allMapped.length} registros).`, type: 'success' }); setShouldFetchNewData(false); }, onError: (error) => { console.error('Fetch error:', error); const errorMessage = error?.message || error?.toString() || 'Error fetching data'; let enhancedMessage = errorMessage; if (errorMessage.includes('Network Error') || errorMessage.includes('403') || errorMessage.includes('CERT')) { enhancedMessage = `${errorMessage}. This is likely a CORS or SSL proxy issue.`; if (new Date().getFullYear() > 2025) enhancedMessage += " NOTE: Your system clock is set to 2026+, which may cause SSL certificates to appear expired."; else enhancedMessage += " Please check your internet connection or try again later."; } setStatus({ message: enhancedMessage, type: 'error' }); setShouldFetchNewData(false); } });

    useEffect(() => {
        const loadFromCache = async () => { if (isInitialLoadComplete) return; setCacheStatus('loading_cache'); setStatus({ message: 'Verificando cache local...', type: 'loading' }); try { const cachedData = await dbCache.get<any>(cacheKeyBase); if (cachedData) { const priceData = Array.isArray(cachedData.price) ? cachedData.price : [], priceMap = new Map<string, NormalizedPrice>(), sortedPrices = [...priceData].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp)); sortedPrices.forEach((p: any) => { const ts = Number(p.timestamp), dateKey = new Date(ts * 1000).toISOString().split('T')[0]; priceMap.set(dateKey, { close: p.price ?? p.close ?? 0, high: p.high ?? p.price ?? 0, low: p.low ?? p.price ?? 0 }); }); priceMapRef.current = priceMap; sortedPricesRef.current = sortedPrices; const binarySearchClosest = (sortedPrices: any[], targetTimestamp: number): any | null => { let left = 0, right = sortedPrices.length - 1, closest = sortedPrices[0], minDiff = Infinity; while (left <= right) { const mid = Math.floor((left + right) / 2), diff = Math.abs(Number(sortedPrices[mid].timestamp) - targetTimestamp); if (diff < minDiff) { minDiff = diff; closest = sortedPrices[mid]; } if (Number(sortedPrices[mid].timestamp) < targetTimestamp) left = mid + 1; else right = mid - 1; } return closest; }; const getNormalizedPrice = (timestamp: number, itemPrice: number): NormalizedPrice => { const dateKey = new Date(timestamp * 1000).toISOString().split('T')[0]; let basePrice = priceMap.get(dateKey); if (basePrice === undefined && sortedPrices.length > 0) { const nearest = binarySearchClosest(sortedPrices, timestamp); if (nearest) { const minDiff = Math.abs(Number(nearest.timestamp) - timestamp); if (minDiff <= 7 * 24 * 60 * 60) basePrice = { close: nearest.price ?? nearest.close ?? itemPrice, high: nearest.high ?? nearest.price ?? itemPrice, low: nearest.low ?? nearest.price ?? itemPrice }; } } if (basePrice === undefined || basePrice.close === 0) basePrice = { close: itemPrice, high: itemPrice, low: itemPrice }; return basePrice; }; const mapLiquidationItem = (item: any, symbolLabel?: string): HistoricalLiquidation => { const timestamp = Number(item.timestamp), itemPrice = Number(item.price), normalizedPrice = getNormalizedPrice(timestamp, itemPrice), longVolume = item.long_volume !== undefined ? item.long_volume : (item.side === 'long' ? item.amount : 0), shortVolume = item.short_volume !== undefined ? item.short_volume : (item.side === 'short' ? item.amount : 0), finalPrice = liquidationPriceType === 'high_low' ? normalizedPrice.close : normalizedPrice.close, longLiquidationPrice = liquidationPriceType === 'high_low' ? normalizedPrice.low : normalizedPrice.close, shortLiquidationPrice = liquidationPriceType === 'high_low' ? normalizedPrice.high : normalizedPrice.close; return { timestamp, long_volume: longVolume, short_volume: shortVolume, total_volume: item.amount, long_short_ratio: longVolume >= shortVolume ? longVolume / Math.max(1, shortVolume) : -(shortVolume / Math.max(1, longVolume)), price: finalPrice, symbol: symbolLabel, original_price: itemPrice, longLiquidationPrice, shortLiquidationPrice }; }; let allMapped: HistoricalLiquidation[] = []; if (cachedData.isMulti) cachedData.liquidations.forEach((liqGroup: any) => { if (Array.isArray(liqGroup.data)) allMapped = allMapped.concat(liqGroup.data.map((item: any) => mapLiquidationItem(item, liqGroup.symbol))); }); else if (Array.isArray(cachedData.liquidation)) allMapped = cachedData.liquidation.map((item: any) => mapLiquidationItem(item, symbol)); allMapped.sort((a, b) => a.timestamp - b.timestamp); setData(allMapped); if (priceData.length > 0) setCurrentPrice(Number(priceData[priceData.length - 1].price || 0)); setLastFetchTime(Date.now()); setCacheStatus('loaded_from_cache'); setStatus({ message: `Dados carregados do cache (${allMapped.length} registros). Clique em "Atualizar Dados" para buscar novos dados.`, type: 'success' }); } else { setCacheStatus('idle'); setStatus({ message: 'Nenhum dado em cache. Clique em "Atualizar Dados" para buscar da API.', type: 'success' }); } } catch (error) { console.error('[Cache] Erro ao carregar do cache:', error); setCacheStatus('idle'); setStatus({ message: 'Erro ao carregar cache. Clique em "Atualizar Dados" para tentar da API.', type: 'error' }); } finally { setIsInitialLoadComplete(true); } }; loadFromCache();
    }, [cacheKeyBase, symbol, isMultiAssetMode]);

    const handleUpdateData = useCallback(async () => { setShouldFetchNewData(true); setCacheStatus('fetching_api'); setStatus({ message: 'Buscando novos dados da API...', type: 'loading' }); await refetch(true); }, [refetch]);

    const getAdaptiveIntervalStats = (processedData: HistoricalLiquidation[]): { min: number; max: number; avg: number; count: number } => { if (processedData.length < 2) return { min: 0, max: 0, avg: 0, count: processedData.length }; const intervals: number[] = []; for (let i = 1; i < processedData.length; i++) { const interval = processedData[i].price - processedData[i - 1].price; if (interval > 0) intervals.push(interval); } if (intervals.length === 0) return { min: 0, max: 0, avg: 0, count: processedData.length }; return { min: Math.min(...intervals), max: Math.max(...intervals), avg: intervals.reduce((a, b) => a + b, 0) / intervals.length, count: processedData.length }; };

    const calculateNormalDistribution = (data: HistoricalLiquidation[]) => { if (data.length === 0) return null; let totalVolume = 0, mean = 0, M2 = 0; for (const item of data) { const volume = item.total_volume; if (volume === 0) continue; totalVolume += volume; const delta = item.price - mean, deltaRatio = delta * volume / totalVolume; mean += deltaRatio; const delta2 = item.price - mean; M2 += volume * delta * delta2; } if (totalVolume === 0) return null; const variance = M2 / totalVolume, stdDev = Math.sqrt(variance); return { mean, stdDev, regions: { sd0_25: [mean - 0.25 * stdDev, mean + 0.25 * stdDev] as [number, number], sd0_5: [mean - 0.5 * stdDev, mean + 0.5 * stdDev] as [number, number], sd1: [mean - stdDev, mean + stdDev] as [number, number], sd2: [mean - 2 * stdDev, mean + 2 * stdDev] as [number, number], sd3: [mean - 3 * stdDev, mean + 3 * stdDev] as [number, number] } }; };

    useEffect(() => { const min = amountMin && !isNaN(parseFloat(amountMin)) ? parseFloat(amountMin) : 0, max = amountMax && !isNaN(parseFloat(amountMax)) ? parseFloat(amountMax) : Infinity, ratioMin = ratioFilter && !isNaN(parseFloat(ratioFilter)) ? parseFloat(ratioFilter) : null, ratioMax = ratioFilterMax && !isNaN(parseFloat(ratioFilterMax)) ? parseFloat(ratioFilterMax) : null;
        // First filter by selected symbol(s)
        let symbolFiltered = data;
        if (!isMultiAssetMode) {
            // Single asset mode: filter to only the selected symbol
            symbolFiltered = data.filter(item => item.symbol === symbol);
        } else {
            // Multi-asset mode: filter to only selected symbols
            symbolFiltered = data.filter(item => item.symbol && selectedSymbols.includes(item.symbol));
        }
        // Then apply volume filter to symbol-filtered data
        let amountFiltered = symbolFiltered.filter(item => item.total_volume >= min && (max === Infinity || item.total_volume <= max));
        if (ratioMin !== null || ratioMax !== null) amountFiltered = amountFiltered.filter(item => { const absRatio = Math.abs(item.long_short_ratio); if (ratioMin !== null && absRatio < ratioMin) return false; if (ratioMax !== null && absRatio > ratioMax) return false; return true; }); let dataForProcessing = amountFiltered; if (useFixedIntervalCount) { const priceMin = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null, priceMax = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null; if (priceMin !== null && priceMax !== null) { const actualMin = Math.min(priceMin, priceMax), actualMax = Math.max(priceMin, priceMax); dataForProcessing = amountFiltered.filter(item => item.price >= actualMin && item.price <= actualMax); } } if (useFixedIntervalCount) setProcessedData(aggregateByFixedCount(dataForProcessing, fixedIntervalCount)); else if (smartIntervalEnabled) { let dataForAdaptive = amountFiltered; if (adaptiveScope === 'range') { const priceMin = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null, priceMax = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null; if (priceMin !== null && priceMax !== null) { const actualMin = Math.min(priceMin, priceMax), actualMax = Math.max(priceMin, priceMax); dataForAdaptive = amountFiltered.filter(item => item.price >= actualMin && item.price <= actualMax); } } setProcessedData(aggregateByAdaptiveInterval(dataForAdaptive, clusterDensity, minInterval, maxInterval)); } else setProcessedData(aggregateByPriceInterval(amountFiltered, priceInterval)); }, [data, priceInterval, side, amountMin, amountMax, ratioFilter, ratioFilterMax, smartIntervalEnabled, clusterDensity, minInterval, maxInterval, adaptiveScope, priceRangeMin, priceRangeMax, useFixedIntervalCount, fixedIntervalCount, aggregateByPriceInterval, aggregateByAdaptiveInterval, aggregateByFixedCount, liquidationPriceType, symbol, selectedSymbols, isMultiAssetMode]);

    const chartData = useMemo(() => { let filteredData = processedData; const minPrice = priceRangeMin && !isNaN(parseFloat(priceRangeMin)) ? parseFloat(priceRangeMin) : null, maxPrice = priceRangeMax && !isNaN(parseFloat(priceRangeMax)) ? parseFloat(priceRangeMax) : null; if (minPrice !== null && maxPrice !== null) { const actualMin = Math.min(minPrice, maxPrice), actualMax = Math.max(minPrice, maxPrice); filteredData = filteredData.filter(item => item.price >= actualMin && item.price <= actualMax); } if (groupBy === 'none' || groupBy === 'combined' || groupBy === 'stacked' || groupBy === 'delta') return filteredData; return filteredData.map(item => ({ ...item, long_volume: groupBy === 'long' ? item.long_volume : 0, short_volume: groupBy === 'short' ? item.short_volume : 0, total_volume: groupBy === 'long' ? item.long_volume : item.short_volume }));
}, [processedData, priceRangeMin, priceRangeMax, groupBy]);

    useEffect(() => {
        if (normalDistributionEnabled && processedData.length > 0) {
            const dataForStats = normalDistScope === 'range' ? chartData : processedData;
            setStdDevData(calculateNormalDistribution(dataForStats));
        } else {
            setStdDevData(null);
        }
    }, [processedData, chartData, normalDistributionEnabled, normalDistScope]);

    useEffect(() => {
        const loadSymbols = async () => {
                            try {
                                const symbols = await liquidationsApi.getSymbols();
                                if (Array.isArray(symbols)) {
                                    setAvailableSymbols(symbols);
                                }
                            } catch (error) {
                                console.error('Error loading symbols:', error);
                            }
                        };
        loadSymbols();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (symbolRef.current && !symbolRef.current.contains(event.target as Node)) {
                setIsSymbolOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const validateInputs = () => {
        if (!isMultiAssetMode && !symbol) {
            setValidationError('Selecione um símbolo');
            return false;
        }
        if (isMultiAssetMode && selectedSymbols.length === 0) {
            setValidationError('Selecione pelo menos um símbolo');
            return false;
        }
        if (months < 0 || months > 120) {
            setValidationError('Período deve estar entre 0 e 120 meses');
            return false;
        }
        setValidationError(null);
        return true;
    };

    const handleFetch = () => {
        if (validateInputs()) {
            handleUpdateData();
        }
    };

    const stats = useMemo(() => {
        if (processedData.length === 0) return null;
        const totalLong = processedData.reduce((sum, item) => sum + item.long_volume, 0);
        const totalShort = processedData.reduce((sum, item) => sum + item.short_volume, 0);
        const totalVolume = totalLong + totalShort;
        const avgPrice = processedData.reduce((sum, item) => sum + item.price * item.total_volume, 0) / totalVolume || 0;
        return { totalLong, totalShort, totalVolume, avgPrice, count: processedData.length };
    }, [processedData]);

    const intervalStats = useMemo(() => getAdaptiveIntervalStats(processedData), [processedData]);

    return (
        <div className="flex flex-col gap-6 p-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Teste de Liquidações</h1>
                    <p className="text-slate-400 text-sm mt-1">Análise de dados históricos de liquidação</p>
                </div>
                <div className="flex items-center gap-2">
                    {cacheStatus === 'loaded_from_cache' && (
                        <span className="px-3 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20">
                            Cache
                        </span>
                    )}
                    {cacheStatus === 'loaded_from_api' && (
                        <span className="px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                            API
                        </span>
                    )}
                    {lastFetchTime && (
                        <span className="text-xs text-slate-500">
                            Última atualização: {new Date(lastFetchTime).toLocaleTimeString()}
                        </span>
                    )}
                </div>
            </div>

            {/* Status Message */}
            {status.message && (
                <div className={`p-4 rounded-lg border ${status.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                    {status.message}
                </div>
            )}

            {/* Validation Error */}
            {validationError && (
                <div className="p-4 rounded-lg border bg-red-500/10 border-red-500/20 text-red-400">
                    {validationError}
                </div>
            )}

            {/* Controls */}
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader
                    className="pb-4"
                    title="Configurações"
                    action={
                        <button
                            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
                            title={showAdvancedSettings ? 'Ocultar configurações avançadas' : 'Mostrar configurações avançadas'}
                        >
                            <SettingsIcon className="h-5 w-5 text-slate-400" />
                            <span>Avançadas</span>
                            {showAdvancedSettings ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                    }
                />
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {/* Symbol Selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Símbolo</label>
                            <div className="relative" ref={symbolRef}>
                                <button
                                    onClick={() => setIsSymbolOpen(!isSymbolOpen)}
                                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 hover:border-slate-600 transition-colors"
                                >
                                    <span className="truncate">{isMultiAssetMode ? `${selectedSymbols.length} selecionados` : currentSymbolData.name}</span>
                                    <ChevronDown className="h-4 w-4 text-slate-400" />
                                </button>
                                {isSymbolOpen && (
                                    <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-[300px] overflow-hidden">
                                        <div className="p-2 border-b border-slate-700">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar..."
                                                    value={symbolSearch}
                                                    onChange={(e) => setSymbolSearch(e.target.value)}
                                                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 placeholder-slate-500"
                                                />
                                            </div>
                                        </div>
                                        <div className="overflow-y-auto max-h-[240px]">
                                            {filteredSymbols.map((s) => (
                                                <button
                                                    key={s.symbol}
                                                    onClick={() => {
                                                        if (isMultiAssetMode) {
                                                            setSelectedSymbols(prev =>
                                                                prev.includes(s.symbol)
                                                                    ? prev.filter(x => x !== s.symbol)
                                                                    : [...prev, s.symbol]
                                                            );
                                                        } else {
                                                            setSymbol(s.symbol);
                                                            setIsSymbolOpen(false);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 text-left hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                                                >
                                                    {isMultiAssetMode && (
                                                        <div className={`w-4 h-4 rounded border ${selectedSymbols.includes(s.symbol) ? 'bg-blue-500 border-blue-500' : 'border-slate-600'} flex items-center justify-center`}>
                                                            {selectedSymbols.includes(s.symbol) && <span className="text-white text-xs">✓</span>}
                                                        </div>
                                                    )}
                                                    <span className="text-slate-200 text-sm">{s.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Months */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Período (meses)</label>
                            <input
                                type="number"
                                min="0"
                                max="120"
                                value={months}
                                onChange={(e) => setMonths(Number(e.target.value))}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Price Interval */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Intervalo de Preço</label>
                            <input
                                type="number"
                                min="1"
                                value={priceInterval}
                                onChange={(e) => setPriceInterval(Number(e.target.value))}
                                disabled={smartIntervalEnabled || useFixedIntervalCount}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                            />
                        </div>

                        {/* Side */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Lado</label>
                            <select
                                value={side}
                                onChange={(e) => setSide(e.target.value as 'all' | 'long' | 'short')}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                            >
                                <option value="all">Todos</option>
                                <option value="long">Long</option>
                                <option value="short">Short</option>
                            </select>
                        </div>

                        {/* Amount Min */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Volume Mínimo</label>
                            <input
                                type="text"
                                value={amountMin}
                                onChange={(e) => setAmountMin(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Amount Max */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Volume Máximo</label>
                            <input
                                type="text"
                                value={amountMax}
                                onChange={(e) => setAmountMax(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Price Range Min */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Preço Mínimo</label>
                            <input
                                type="text"
                                value={priceRangeMin}
                                onChange={(e) => setPriceRangeMin(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Price Range Max */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Preço Máximo</label>
                            <input
                                type="text"
                                value={priceRangeMax}
                                onChange={(e) => setPriceRangeMax(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Group By */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Agrupar Por</label>
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value as any)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                            >
                                <option value="none">Nenhum</option>
                                <option value="long">Long</option>
                                <option value="short">Short</option>
                                <option value="combined">Combinado</option>
                                <option value="stacked">Empilhado</option>
                                <option value="delta">Delta</option>
                            </select>
                        </div>
                    </div>

                    {/* Advanced Settings */}
                    {showAdvancedSettings && (
                        <div className="pt-4 border-t border-slate-800 space-y-4">
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Configurações Avançadas</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {/* Grid Line Interval */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Intervalo das Linhas de Grade</label>
                                    <input
                                        type="number"
                                        min="100"
                                        value={gridLineInterval}
                                        onChange={(e) => setGridLineInterval(Number(e.target.value))}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>

                                {/* Smart Interval Toggle */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Intervalo Inteligente</label>
                                    <button
                                        onClick={() => setSmartIntervalEnabled(!smartIntervalEnabled)}
                                        className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${smartIntervalEnabled ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                    >
                                        {smartIntervalEnabled ? 'Ativado' : 'Desativado'}
                                    </button>
                                </div>

                                {/* Fixed Interval Count Toggle */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Contagem Fixa de Intervalos</label>
                                    <button
                                        onClick={() => setUseFixedIntervalCount(!useFixedIntervalCount)}
                                        className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${useFixedIntervalCount ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                    >
                                        {useFixedIntervalCount ? 'Ativado' : 'Desativado'}
                                    </button>
                                </div>

                                {/* Fixed Interval Count Value */}
                                {useFixedIntervalCount && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Número de Intervalos</label>
                                        <input
                                            type="number"
                                            min="10"
                                            max="500"
                                            value={fixedIntervalCount}
                                            onChange={(e) => setFixedIntervalCount(Number(e.target.value))}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                )}

                                {/* Adaptive Scope */}
                                {smartIntervalEnabled && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Escopo do Intervalo Adaptativo</label>
                                        <select
                                            value={adaptiveScope}
                                            onChange={(e) => setAdaptiveScope(e.target.value as 'complete' | 'range')}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                        >
                                            <option value="complete">Completo</option>
                                            <option value="range">Faixa de Preço</option>
                                        </select>
                                    </div>
                                )}

                                {/* Min/Max Interval */}
                                {smartIntervalEnabled && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Intervalo Mínimo</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={minInterval}
                                                onChange={(e) => setMinInterval(Number(e.target.value))}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Intervalo Máximo</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={maxInterval}
                                                onChange={(e) => setMaxInterval(Number(e.target.value))}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Cluster Density */}
                                {smartIntervalEnabled && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Densidade de Cluster (1-100)</label>
                                        <input
                                            type="range"
                                            min="1"
                                            max="100"
                                            value={clusterDensity}
                                            onChange={(e) => setClusterDensity(Number(e.target.value))}
                                            className="w-full"
                                        />
                                        <div className="text-xs text-slate-400 text-center">{clusterDensity}</div>
                                    </div>
                                )}

                                {/* Normal Distribution Toggle */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Distribuição Normal</label>
                                    <button
                                        onClick={() => setNormalDistributionEnabled(!normalDistributionEnabled)}
                                        className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${normalDistributionEnabled ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                    >
                                        {normalDistributionEnabled ? 'Ativada' : 'Desativada'}
                                    </button>
                                </div>

                                {/* Normal Dist Scope */}
                                {normalDistributionEnabled && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Escopo da Distribuição</label>
                                        <select
                                            value={normalDistScope}
                                            onChange={(e) => setNormalDistScope(e.target.value as 'complete' | 'range')}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                        >
                                            <option value="complete">Completo</option>
                                            <option value="range">Faixa de Preço</option>
                                        </select>
                                    </div>
                                )}

                                {/* Show Mean Line */}
                                {normalDistributionEnabled && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Mostrar Linha da Média</label>
                                        <button
                                            onClick={() => setShowMeanLine(!showMeanLine)}
                                            className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${showMeanLine ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                        >
                                            {showMeanLine ? 'Sim' : 'Não'}
                                        </button>
                                    </div>
                                )}

                                {/* Show SD Lines */}
                                {normalDistributionEnabled && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Mostrar SD 0.25</label>
                                            <button
                                                onClick={() => setShowSD0_25(!showSD0_25)}
                                                className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${showSD0_25 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                            >
                                                {showSD0_25 ? 'Sim' : 'Não'}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Mostrar SD 0.5</label>
                                            <button
                                                onClick={() => setShowSD0_5(!showSD0_5)}
                                                className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${showSD0_5 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                            >
                                                {showSD0_5 ? 'Sim' : 'Não'}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Mostrar SD 1</label>
                                            <button
                                                onClick={() => setShowSD1(!showSD1)}
                                                className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${showSD1 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                            >
                                                {showSD1 ? 'Sim' : 'Não'}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Mostrar SD 2</label>
                                            <button
                                                onClick={() => setShowSD2(!showSD2)}
                                                className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${showSD2 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                            >
                                                {showSD2 ? 'Sim' : 'Não'}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Mostrar SD 3</label>
                                            <button
                                                onClick={() => setShowSD3(!showSD3)}
                                                className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${showSD3 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                            >
                                                {showSD3 ? 'Sim' : 'Não'}
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* Liquidation Zones Toggle */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Zonas de Liquidação</label>
                                    <button
                                        onClick={() => setLiquidationZonesEnabled(!liquidationZonesEnabled)}
                                        className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${liquidationZonesEnabled ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                    >
                                        {liquidationZonesEnabled ? 'Ativadas' : 'Desativadas'}
                                    </button>
                                </div>

                                {/* Liquidation Zones Settings */}
                                {liquidationZonesEnabled && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Intervalo das Zonas</label>
                                            <input
                                                type="number"
                                                min="100"
                                                value={liquidationZonesInterval}
                                                onChange={(e) => setLiquidationZonesInterval(Number(e.target.value))}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Porcentagem das Zonas (%)</label>
                                            <input
                                                type="number"
                                                min="0.1"
                                                max="10"
                                                step="0.1"
                                                value={liquidationZonesPercent}
                                                onChange={(e) => setLiquidationZonesPercent(Number(e.target.value))}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-300">Cor por Delta</label>
                                            <button
                                                onClick={() => setLiquidationZonesColorByDelta(!liquidationZonesColorByDelta)}
                                                className={`w-full px-3 py-2 rounded-lg font-medium transition-colors ${liquidationZonesColorByDelta ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                                            >
                                                {liquidationZonesColorByDelta ? 'Sim' : 'Não'}
                                            </button>
                                        </div>
                                        {liquidationZonesColorByDelta ? (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-slate-300">Cor Long</label>
                                                    <input
                                                        type="color"
                                                        value={liquidationZonesLongColor}
                                                        onChange={(e) => setLiquidationZonesLongColor(e.target.value)}
                                                        className="w-full h-10 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-slate-300">Cor Short</label>
                                                    <input
                                                        type="color"
                                                        value={liquidationZonesShortColor}
                                                        onChange={(e) => setLiquidationZonesShortColor(e.target.value)}
                                                        className="w-full h-10 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-slate-300">Cor das Zonas</label>
                                                <input
                                                    type="color"
                                                    value={liquidationZonesColor}
                                                    onChange={(e) => setLiquidationZonesColor(e.target.value)}
                                                    className="w-full h-10 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Tooltip Currency */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Moeda do Tooltip</label>
                                    <select
                                        value={tooltipCurrency}
                                        onChange={(e) => setTooltipCurrency(e.target.value as 'usd' | 'btc')}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                    >
                                        <option value="usd">USD ($)</option>
                                        <option value="btc">BTC (₿)</option>
                                    </select>
                                </div>

                                {/* Liquidation Price Type */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Tipo de Preço de Liquidação</label>
                                    <select
                                        value={liquidationPriceType}
                                        onChange={(e) => setLiquidationPriceType(e.target.value as 'close' | 'high_low')}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                    >
                                        <option value="close">Fechamento</option>
                                        <option value="high_low">Máxima/Mínima</option>
                                    </select>
                                </div>

                                {/* Price Refresh Interval */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Atualização de Preço (seg)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="300"
                                        value={priceRefreshInterval}
                                        onChange={(e) => setPriceRefreshInterval(Number(e.target.value))}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-800">
                        <button
                            onClick={handleFetch}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                        >
                            {isLoading ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="h-4 w-4" />
                            )}
                            {isLoading ? 'Carregando...' : 'Atualizar Dados'}
                        </button>

                        <button
                            onClick={handleExportCSV}
                            disabled={processedData.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg font-medium transition-colors"
                        >
                            <Upload className="h-4 w-4" />
                            Exportar CSV
                        </button>

                        <button
                            onClick={handleExportJSON}
                            disabled={data.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg font-medium transition-colors"
                        >
                            <Upload className="h-4 w-4" />
                            Exportar JSON
                        </button>

                        <button
                            onClick={handleImportClick}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
                        >
                            <Download className="h-4 w-4" />
                            Importar
                        </button>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".csv,.json"
                            className="hidden"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                        <div className="text-sm text-slate-400">Total Long</div>
                        <div className="text-xl font-bold text-emerald-400">{formatCurrency(stats.totalLong)}</div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                        <div className="text-sm text-slate-400">Total Short</div>
                        <div className="text-xl font-bold text-red-400">{formatCurrency(stats.totalShort)}</div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                        <div className="text-sm text-slate-400">Volume Total</div>
                        <div className="text-xl font-bold text-blue-400">{formatCurrency(stats.totalVolume)}</div>
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
                        <div className="text-sm text-slate-400">Registros</div>
                        <div className="text-xl font-bold text-slate-200">{stats.count}</div>
                    </div>
                </div>
            )}

            {/* Chart */}
            {chartData.length > 0 && (
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader
                        className="pb-4"
                        title="Gráfico de Liquidações"
                        action={
                            <button
                                onClick={() => setChartHorizontal(!chartHorizontal)}
                                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                                title="Alternar orientação"
                            >
                                <Activity className="h-4 w-4" />
                            </button>
                        }
                    />
                    <CardContent>
                        <div
                            style={{ height: chartHeight }}
                            className="relative"
                        >
                            <LiquidationChart
                                data={chartData}
                                formatCurrency={formatCurrency}
                                groupBy={groupBy}
                                currentPrice={currentPrice}
                                priceInterval={priceInterval}
                                horizontal={chartHorizontal}
                                symbol={symbol}
                                tooltipCurrency={tooltipCurrency}
                                stdDevData={stdDevData}
                                showMeanLine={showMeanLine}
                                showSD0_25={showSD0_25}
                                showSD0_5={showSD0_5}
                                showSD1={showSD1}
                                showSD2={showSD2}
                                showSD3={showSD3}
                                gridLineInterval={gridLineInterval}
                                liquidationZonesEnabled={liquidationZonesEnabled}
                                liquidationZonesPercent={liquidationZonesPercent}
                                liquidationZonesInterval={liquidationZonesInterval}
                                liquidationZonesColor={liquidationZonesColor}
                                liquidationZonesColorByDelta={liquidationZonesColorByDelta}
                                liquidationZonesLongColor={liquidationZonesLongColor}
                                liquidationZonesShortColor={liquidationZonesShortColor}
                            />
                            {/* Resize Handle */}
                            <div
                                onMouseDown={handleChartResizeMouseDown}
                                className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize flex items-center justify-center hover:bg-slate-800/50 transition-colors"
                            >
                                <div className="w-8 h-1 bg-slate-700 rounded-full" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}