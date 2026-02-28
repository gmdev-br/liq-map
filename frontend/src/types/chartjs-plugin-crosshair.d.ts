declare module 'chartjs-plugin-crosshair' {
    import { Plugin } from 'chart.js';

    interface CrosshairLineOptions {
        color?: string | CanvasGradient | CanvasPattern;
        width?: number;
        dash?: number[];
    }

    interface CrosshairSyncOptions {
        enabled?: boolean;
        group?: number;
        suppressed?: boolean;
    }

    interface CrosshairZoomOptions {
        enabled?: boolean;
        rectProps?: Record<string, unknown>;
    }

    interface CrosshairOptions {
        enabled?: boolean;
        mode?: 'x' | 'y' | 'xy' | 'index' | 'nearest' | 'dataset' | 'single';
        intersect?: boolean;
        line?: CrosshairLineOptions;
        sync?: CrosshairSyncOptions;
        zoom?: CrosshairZoomOptions;
        snapToDataPoint?: boolean;
        callbacks?: {
            beforeDraw?: (chart: any) => void;
            afterDraw?: (chart: any) => void;
        };
    }

    const crosshairPlugin: Plugin;
    export default crosshairPlugin;
    export { CrosshairOptions };
}
