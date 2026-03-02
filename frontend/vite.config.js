import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
var __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    base: '/',
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api/coinalyze': {
                target: 'https://api.coinalyze.net',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api\/coinalyze/, '/v1/liquidation-history'); }
            },
            '/api/binance-spot': {
                target: 'https://api.binance.com',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api\/binance-spot/, ''); }
            },
            '/api/binance-futures': {
                target: 'https://fapi.binance.com',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api\/binance-futures/, ''); }
            },
            '/api/coingecko': {
                target: 'https://api.coingecko.com',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api\/coingecko/, '/api/v3'); }
            }
        }
    },
});
