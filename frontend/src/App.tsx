import { HashRouter, Routes, Route } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Toaster } from 'sonner';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { LiquidationTest } from '@/pages/LiquidationTest';
import { Exchanges } from '@/pages/Exchanges';
import { Alerts } from '@/pages/Alerts';
import { Settings } from '@/pages/Settings';
import { queryClient, persister } from '@/store';

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Persist only liquidation-related queries
            const queryKey = query.queryKey[0];
            return queryKey === 'liquidations' || queryKey === 'liquidation-stats';
          },
        },
      }}
    >
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="liquidation-test" element={<LiquidationTest />} />
            <Route path="exchanges" element={<Exchanges />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster
        position="top-right"
        richColors
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      />
    </PersistQueryClientProvider>
  );
}

export default App;
