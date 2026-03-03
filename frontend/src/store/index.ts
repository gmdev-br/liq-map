import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Settings {
  apiKey: string;
  theme: 'light' | 'dark';
  cacheDuration: number;
}

interface AppState {
  // Settings
  settings: Settings;
  setSettings: (settings: Partial<Settings>) => void;
  
  // UI State
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  // Connection Status
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;
  
  // Selected values
  selectedExchange: string | null;
  setSelectedExchange: (exchange: string | null) => void;
  selectedSymbol: string | null;
  setSelectedSymbol: (symbol: string | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Settings
      settings: {
        apiKey: '',
        theme: 'dark',
        cacheDuration: 5,
      },
      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      
      // UI State
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      
      // Connection Status
      wsConnected: false,
      setWsConnected: (connected) => set({ wsConnected: connected }),
      
      // Selected values
      selectedExchange: null,
      setSelectedExchange: (exchange) => set({ selectedExchange: exchange }),
      selectedSymbol: null,
      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
    }),
    {
      name: 'coinglass-storage',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);

// OPTIMIZED: Lazy initialization to avoid blocking main thread on startup
// Uses requestIdleCallback or setTimeout to defer parsing
const applyTheme = () => {
  if (typeof window === 'undefined') return;

  const apply = () => {
    const theme = localStorage.getItem('coinglass-storage');
    if (theme) {
      try {
        const parsed = JSON.parse(theme);
        if (parsed.state?.settings?.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch { /* ignore parse errors */ }
    }
  };

  // Defer execution to avoid blocking initial render
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(apply, { timeout: 100 });
  } else {
    setTimeout(apply, 0);
  }
};

applyTheme();
