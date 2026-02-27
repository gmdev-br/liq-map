import { useQuery } from '@tanstack/react-query';
import { pricesApi } from '@/services/api';

export function usePrices(params?: {
  page?: number;
  page_size?: number;
  symbol?: string;
  exchange?: string;
  start_date?: string;
  end_date?: string;
}) {
  return useQuery({
    queryKey: ['prices', params],
    queryFn: () => pricesApi.getAll(params).then((res) => res.data),
    refetchInterval: 30000,
  });
}

export function useTechnicalIndicators(params: {
  symbol: string;
  exchange?: string;
  interval?: string;
}) {
  return useQuery({
    queryKey: ['indicators', params],
    queryFn: () => pricesApi.getIndicators(params).then((res) => res.data),
    refetchInterval: 60000,
    enabled: !!params.symbol,
  });
}
