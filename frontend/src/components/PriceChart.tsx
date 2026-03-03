import { useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ChartData,
  Chart,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Chart as ReactChart } from 'react-chartjs-2';
import type { Liquidation, Price } from '@/types';

// Storage key prefix for chart zoom/pan state
const CHART_ZOOM_STORAGE_KEY = 'coinglass-chart-zoom';

// Helper to get storage key for a specific symbol
const getZoomStorageKey = (symbol: string | undefined) => {
  const key = symbol || 'default';
  return `${CHART_ZOOM_STORAGE_KEY}-${key}`;
};

// Type for stored zoom state
interface ZoomState {
  min: number;
  max: number;
}

// Custom crosshair plugin
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw: (chart: Chart) => {
    const ctx = chart.ctx;
    const xAxis = chart.scales.x;
    const yAxis = chart.scales.y;
    
    if (!xAxis || !yAxis) return;

    // Get the active points
    const activePoints = chart.getActiveElements();
    
    if (activePoints && activePoints.length > 0) {
      const activePoint = activePoints[0];
      const x = xAxis.getPixelForValue(activePoint.index);
      
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      
      // Vertical line (crosshair)
      ctx.moveTo(x, yAxis.top);
      ctx.lineTo(x, yAxis.bottom);
      
      // Horizontal line
      const y = yAxis.getPixelForValue(chart.data.datasets[0].data[activePoint.index] as number);
      ctx.moveTo(xAxis.left, y);
      ctx.lineTo(xAxis.right, y);
      
      ctx.stroke();
      ctx.restore();
    }
  },
};

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin,
  crosshairPlugin
);

// PriceChart component props
interface PriceChartProps {
  data: Price[] | Liquidation[];
  type: 'line' | 'bar' | 'area';
  dataKey: string;
  xAxisKey?: string;
  color?: string;
  showGrid?: boolean;
  height?: number;
  symbol?: string;
}

export function PriceChart({
  data,
  type,
  dataKey,
  xAxisKey = 'timestamp',
  color = '#3b82f6',
  showGrid = true,
  height = 300,
  symbol,
}: PriceChartProps) {
  const chartRef = useRef<Chart<'line' | 'bar'>>(null);

  // Load saved zoom state from localStorage
  const loadSavedZoomState = useCallback((): ZoomState | null => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(getZoomStorageKey(symbol));
      if (saved) {
        return JSON.parse(saved) as ZoomState;
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }, [symbol]);

  // Save zoom state to localStorage
  const saveZoomState = useCallback((state: ZoomState) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(getZoomStorageKey(symbol), JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }, [symbol]);

  // Restore zoom state when chart is ready
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const savedState = loadSavedZoomState();
    if (savedState && chart.scales.x) {
      chart.zoomScale('x', { min: savedState.min, max: savedState.max }, 'default');
    }
  }, [loadSavedZoomState]);

  // OPTIMIZED: Single pass O(n) instead of O(3n) - combines formatting and data extraction
  const chartData: ChartData<'line' | 'bar'> = useMemo(() => {
    const labels: string[] = [];
    const values: number[] = [];

    for (const item of data) {
      // Parse date
      const rawValue = item[xAxisKey as keyof typeof item];
      let date: Date;

      if (typeof rawValue === 'number') {
        date = new Date(rawValue < 10000000000 ? rawValue * 1000 : rawValue);
      } else if (typeof rawValue === 'string') {
        date = new Date(rawValue);
        if (isNaN(date.getTime()) && !isNaN(Number(rawValue))) {
          const numValue = Number(rawValue);
          date = new Date(numValue < 10000000000 ? numValue * 1000 : numValue);
        }
      } else {
        date = new Date();
      }

      // Extract label and value in single pass
      labels.push(date.toLocaleDateString());
      const val = item[dataKey as keyof typeof item];
      values.push(typeof val === 'number' ? val : 0);
    }

    return {
      labels,
      datasets: [
        {
          label: dataKey,
          data: values,
          borderColor: color,
          backgroundColor: type === 'area' ? `${color}33` : type === 'bar' ? color : 'transparent',
          fill: type === 'area',
          tension: 0.4,
          pointRadius: type === 'line' || type === 'area' ? 0 : 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: type === 'bar' ? 0 : 2,
          borderRadius: type === 'bar' ? 4 : 0,
        },
      ],
    };

    return {
      labels,
      datasets: [
        {
          label: dataKey,
          data: values,
          borderColor: color,
          backgroundColor: type === 'area' ? `${color}33` : type === 'bar' ? color : 'transparent',
          fill: type === 'area',
          tension: 0.4,
          pointRadius: type === 'line' || type === 'area' ? 0 : 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: type === 'bar' ? 0 : 2,
          borderRadius: type === 'bar' ? 4 : 0,
        },
      ],
    };
  }, [data, dataKey, xAxisKey, color, type]);

  const chartOptions: ChartOptions<'line' | 'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        crosshair: {
          enabled: true,
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'hsl(var(--card))',
          titleColor: 'hsl(var(--card-foreground))',
          bodyColor: 'hsl(var(--card-foreground))',
          borderColor: 'hsl(var(--border))',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            label: (context) => {
              const value = context.parsed.y;
              return `${dataKey}: ${typeof value === 'number' ? value.toLocaleString() : value}`;
            },
          },
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
            onPan: ({ chart }) => {
              const xScale = chart.scales.x;
              if (xScale) {
                saveZoomState({ min: xScale.min, max: xScale.max });
              }
            },
          },
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true,
            },
            mode: 'x',
            onZoom: ({ chart }) => {
              const xScale = chart.scales.x;
              if (xScale) {
                saveZoomState({ min: xScale.min, max: xScale.max });
              }
            },
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: showGrid,
            color: 'hsl(var(--muted) / 0.3)',
          },
          ticks: {
            color: 'hsl(var(--muted-foreground))',
            font: {
              size: 11,
            },
            maxRotation: 45,
            minRotation: 0,
            maxTicksLimit: 12,
          },
        },
        y: {
          display: true,
          grid: {
            display: showGrid,
            color: 'hsl(var(--muted) / 0.3)',
          },
          ticks: {
            color: 'hsl(var(--muted-foreground))',
            font: {
              size: 11,
            },
            callback: (value) => {
              if (typeof value === 'number') {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                return value.toLocaleString();
              }
              return value;
            },
          },
        },
      },
      animation: {
        duration: 300,
      },
    }),
    [showGrid, dataKey, color, saveZoomState]
  );

  // Reset zoom function
  const resetZoom = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.resetZoom();
      // Clear saved zoom state
      if (typeof window !== 'undefined') {
        localStorage.removeItem(getZoomStorageKey(symbol));
      }
    }
  }, [symbol]);

  if (!data || data.length === 0) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/20 bg-muted/5 text-sm text-muted-foreground"
        style={{ height }}
      >
        <p>Sem dados disponíveis para este período</p>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Zoom controls */}
      <div className="absolute end-2 top-2 z-10 flex gap-1">
        <button
          onClick={resetZoom}
          className="rounded-md bg-card px-2 py-1 text-xs text-card-foreground shadow-sm transition-colors hover:bg-accent"
          title="Reset Zoom"
        >
          Reset
        </button>
      </div>
      <ReactChart
        ref={chartRef}
        type={type === 'area' ? 'line' : type}
        data={chartData}
        options={chartOptions}
      />
    </div>
  );
}

// Exchange distribution chart
interface ExchangeChartProps {
  data: Record<string, number>;
  title?: string;
}

export function ExchangeChart({ data, title }: ExchangeChartProps) {
  const chartData: ChartData<'bar'> = useMemo(() => {
    const entries = Object.entries(data);
    return {
      labels: entries.map(([name]) => name),
      datasets: [
        {
          data: entries.map(([, value]) => value),
          backgroundColor: [
            '#3b82f6',
            '#10b981',
            '#f59e0b',
            '#ef4444',
            '#8b5cf6',
            '#ec4899',
            '#06b6d4',
            '#84cc16',
          ],
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    };
  }, [data]);

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'hsl(var(--card))',
        titleColor: 'hsl(var(--card-foreground))',
        bodyColor: 'hsl(var(--card-foreground))',
        borderColor: 'hsl(var(--border))',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: {
          color: 'hsl(var(--muted) / 0.3)',
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
          font: {
            size: 11,
          },
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: 'hsl(var(--muted-foreground))',
          font: {
            size: 11,
          },
        },
      },
    },
  };

  return (
    <div className="w-full">
      {title && <h3 className="mb-4 text-sm font-medium">{title}</h3>}
      <div className="h-[300px] w-full">
        <ReactChart type="bar" data={chartData} options={options} />
      </div>
    </div>
  );
}
