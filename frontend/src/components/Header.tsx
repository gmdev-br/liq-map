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
      <div className="flex h-14 items-center px-4 gap-4">
        <button
          onClick={toggleSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Menu</span>
        </button>

        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gradient">{pageTitle}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="search"
              placeholder="Search..."
              className="h-9 w-56 glass-input pl-9 pr-3 text-sm text-white placeholder:text-white/40"
            />
          </div>

          {/* Connection Status */}
          <div
            className={clsx(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border',
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            {settings.theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>

          {/* Notifications */}
          <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className={clsx(
              'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              location.pathname === '/settings'
                ? 'bg-white/15 text-white'
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
