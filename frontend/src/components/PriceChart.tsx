import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
import type { Liquidation, Price } from '@/types';

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
  const formattedData = data.map((item) => {
    const rawValue = item[xAxisKey as keyof typeof item];
    let date: Date;

    if (typeof rawValue === 'number') {
      // Se for número (timestamp Unix), assume que está em segundos se for < 10^12
      // (timestamps em segundos são ~1.7e9, em milissegundos são ~1.7e12)
      date = new Date(rawValue < 10000000000 ? rawValue * 1000 : rawValue);
    } else if (typeof rawValue === 'string') {
      // Se for string, tenta criar a data diretamente
      date = new Date(rawValue);
      // Se a data for inválida e a string for um número, tenta converter
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
    };
  });

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={formattedData}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
            <XAxis dataKey={xAxisKey} className="text-xs" />
            <YAxis
              className="text-xs"
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart data={formattedData}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
            <XAxis dataKey={xAxisKey} className="text-xs" />
            <YAxis
              className="text-xs"
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={color}
              fillOpacity={0.2}
            />
          </AreaChart>
        );
      default:
        return (
          <LineChart data={formattedData}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
            <XAxis dataKey={xAxisKey} className="text-xs" />
            <YAxis
              className="text-xs"
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        );
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex w-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/20 bg-muted/5 text-sm text-muted-foreground" style={{ height }}>
        <p>Sem dados disponíveis para este período</p>
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

// Exchange distribution chart
interface ExchangeChartProps {
  data: Record<string, number>;
  title?: string;
}

export function ExchangeChart({ data, title }: ExchangeChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name,
    value,
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="w-full">
      {title && <h3 className="mb-4 text-sm font-medium">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis type="number" className="text-xs" />
          <YAxis dataKey="name" type="category" width={80} className="text-xs" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
