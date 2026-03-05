import { useMemo } from 'react';
import { RefreshCw, Clock, AlertCircle, AlertTriangle } from 'lucide-react';
import { format, differenceInMinutes, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CacheStatusProps {
    lastUpdated: Date | null;
    isStale: boolean;
    isLoading: boolean;
    onRefresh: () => void;
    title?: string;
}

export function CacheStatus({
    lastUpdated,
    isStale,
    isLoading,
    onRefresh,
    title = 'Dados'
}: CacheStatusProps) {
    const statusInfo = useMemo(() => {
        if (!lastUpdated) {
            return {
                text: 'Nunca atualizado',
                statusColor: 'text-gray-400',
                bgColor: 'bg-gray-500/10',
                borderColor: 'border-gray-500/20',
                icon: Clock,
                urgency: 'none' as const
            };
        }

        const minutesAgo = differenceInMinutes(new Date(), lastUpdated);
        const hoursAgo = differenceInHours(new Date(), lastUpdated);

        // Determine status based on age
        if (hoursAgo >= 2) {
            return {
                text: `Atualizado há ${hoursAgo}h`,
                statusColor: 'text-red-400',
                bgColor: 'bg-red-500/10',
                borderColor: 'border-red-500/20',
                icon: AlertCircle,
                urgency: 'critical' as const
            };
        }

        if (minutesAgo >= 30 || isStale) {
            return {
                text: `Atualizado há ${minutesAgo} min`,
                statusColor: 'text-yellow-400',
                bgColor: 'bg-yellow-500/10',
                borderColor: 'border-yellow-500/20',
                icon: AlertTriangle,
                urgency: 'warning' as const
            };
        }

        if (minutesAgo < 1) {
            return {
                text: 'Atualizado agora',
                statusColor: 'text-green-400',
                bgColor: 'bg-green-500/10',
                borderColor: 'border-green-500/20',
                icon: Clock,
                urgency: 'fresh' as const
            };
        }

        return {
            text: `Atualizado há ${minutesAgo} min`,
            statusColor: 'text-blue-400',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/20',
            icon: Clock,
            urgency: 'fresh' as const
        };
    }, [lastUpdated, isStale]);

    const formattedTime = useMemo(() => {
        if (!lastUpdated) return null;
        return format(lastUpdated, 'HH:mm', { locale: ptBR });
    }, [lastUpdated]);

    const StatusIcon = statusInfo.icon;

    return (
        <div className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${statusInfo.bgColor} ${statusInfo.borderColor} backdrop-blur-sm`}>
            {/* Status Indicator */}
            <div className="flex items-center gap-2">
                <StatusIcon className={`h-4 w-4 ${statusInfo.statusColor}`} />
                <div className="flex flex-col">
                    <span className="text-xs text-white/60">{title}</span>
                    <span className={`text-xs font-medium ${statusInfo.statusColor}`}>
                        {statusInfo.text}
                    </span>
                </div>
            </div>

            {/* Time Badge */}
            {formattedTime && (
                <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                    <span className="text-xs text-white/50">{formattedTime}</span>
                </div>
            )}

            {/* Refresh Button */}
            <button
                onClick={onRefresh}
                disabled={isLoading}
                className="flex items-center justify-center w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                title="Atualizar agora"
            >
                <RefreshCw
                    className={`h-3.5 w-3.5 text-white/70 group-hover:text-white transition-colors ${
                        isLoading ? 'animate-spin' : ''
                    }`}
                />
            </button>
        </div>
    );
}

export default CacheStatus;
