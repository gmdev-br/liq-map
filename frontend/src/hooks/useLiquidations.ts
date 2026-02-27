import { useQuery } from '@tanstack/react-query';
import { liquidationsApi } from '@/services/api';

export function useLiquidations(params?: {
  page?: number;
  page_size?: number;
  exchange?: string;
  symbol?: string;
  start_date?: string;
  end_date?: string;
  amount_min?: number;
  amount_max?: number;
}) {
  return useQuery({
    queryKey: ['liquidations', params],
    queryFn: () => liquidationsApi.getAll(params).then((res) => res.data),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useLiquidationStats(params?: {
  start_date?: string;
  end_date?: string;
  exchange?: string;
  symbol?: string;
  days?: number;
}) {
  return useQuery({
    queryKey: ['liquidation-stats', params],
    queryFn: () => liquidationsApi.getStats(params).then((res) => res.data),
    refetchInterval: 60000, // Refresh every minute
  });
}
