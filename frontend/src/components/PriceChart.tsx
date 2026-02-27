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

// Gerar ticks de 200 em 200 para a escala de preços de 50000 a 100000
const priceTicks: number[] = [];
for (let i = 50000; i <= 100000; i += 200) {
  priceTicks.push(i);
}

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
  const formattedData = data.map((item) => ({
    ...item,
    [xAxisKey]: new Date(item[xAxisKey as keyof typeof item] as string).toLocaleDateString(),
  }));

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={formattedData}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />}
            <XAxis dataKey={xAxisKey} className="text-xs" />
            <YAxis 
              className="text-xs" 
              domain={[50000, 100000]} 
              ticks={priceTicks}
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
              domain={[50000, 100000]} 
              ticks={priceTicks}
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
              domain={[50000, 100000]} 
              ticks={priceTicks}
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
