import { useRef, useMemo } from 'react';
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
}

export function PriceChart({
  data,
  type,
  dataKey,
  xAxisKey = 'timestamp',
  color = '#3b82f6',
  showGrid = true,
  height = 300,
}: PriceChartProps) {
  const chartRef = useRef<Chart<'line' | 'bar'>>(null);

  const formattedData = useMemo(() => {
    return data.map((item) => {
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

      return {
        ...item,
        [xAxisKey]: date.toLocaleDateString(),
        _rawDate: date,
      };
    });
  }, [data, xAxisKey]);

  const chartData: ChartData<'line' | 'bar'> = useMemo(() => {
    const labels = formattedData.map((item) => String((item as Record<string, unknown>)[xAxisKey]));
    const values = formattedData.map((item) => {
      const val = (item as Record<string, unknown>)[dataKey];
      return typeof val === 'number' ? val : 0;
    });

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
  }, [formattedData, dataKey, xAxisKey, color, type]);

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
            // Pan without requiring shift key
          },
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true,
            },
            mode: 'x',
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
    [showGrid, dataKey, color]
  );

  // Reset zoom function
  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

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
