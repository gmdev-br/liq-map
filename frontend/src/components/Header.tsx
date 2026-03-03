import { useLocation, Link } from 'react-router-dom';
import { Menu, Sun, Moon, Bell, Search, Settings, Wifi, WifiOff } from 'lucide-react';
import { useStore } from '@/store';
import { clsx } from 'clsx';

export function Header() {
  const location = useLocation();
  const { toggleSidebar, settings, setSettings, wsConnected } = useStore();

  const toggleTheme = () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    setSettings({ theme: newTheme });
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const pageTitle = {
    '/': 'Dashboard',
    '/liquidation-test': 'Teste Liquidação',
    '/exchanges': 'Exchanges',
    '/alerts': 'Alerts',
    '/settings': 'Settings',
  }[location.pathname] || 'Dashboard';

  return (
    <header className="glass-header sticky top-0 z-40 w-full">
      <div className="flex h-16 items-center px-4 gap-4">
        <button
          onClick={toggleSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-liquid-sm text-white/70 hover:bg-white/10 hover:text-white transition-all duration-300"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Menu</span>
        </button>

        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gradient">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="search"
              placeholder="Search..."
              className="h-10 w-64 glass-input pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none"
            />
          </div>

          {/* Connection Status */}
          <div
            className={clsx(
              'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-md border',
              wsConnected
                ? 'bg-green-500/15 text-green-400 border-green-500/25'
                : 'bg-red-500/15 text-red-400 border-red-500/25'
            )}
          >
            {wsConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Offline</span>
              </>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="inline-flex h-10 w-10 items-center justify-center rounded-liquid-sm text-white/70 hover:bg-white/10 hover:text-white transition-all duration-300"
          >
            {settings.theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>

          {/* Notifications */}
          <button className="relative inline-flex h-10 w-10 items-center justify-center rounded-liquid-sm text-white/70 hover:bg-white/10 hover:text-white transition-all duration-300">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-red-400 to-red-600 shadow-glow-red" />
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className={clsx(
              'inline-flex h-10 w-10 items-center justify-center rounded-liquid-sm transition-all duration-300',
              location.pathname === '/settings'
                ? 'bg-white/15 text-white shadow-glow'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
