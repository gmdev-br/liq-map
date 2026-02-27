import { NavLink } from 'react-router-dom';
import { useStore } from '@/store';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  LineChart,
  Building2,
  Bell,
  Settings,
  TrendingUp,
  X,
  Activity,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Menu,
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/liquidation-test', icon: FlaskConical, label: 'Teste Liquidação' },
  { path: '/prices', icon: LineChart, label: 'Prices' },
  { path: '/exchanges', icon: Building2, label: 'Exchanges' },
  { path: '/alerts', icon: Bell, label: 'Alerts' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useStore();

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-16 left-0 z-30 h-[calc(100vh-4rem)] border-r border-border bg-card transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-64' : 'w-16',
          !sidebarOpen && '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className={clsx('text-lg font-bold transition-all duration-300', sidebarOpen ? 'opacity-100' : 'opacity-0 hidden')}>Coinglass</span>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span className={clsx('transition-all duration-300', sidebarOpen ? 'opacity-100' : 'opacity-0 hidden')}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-border p-4">
          <div className={clsx('rounded-lg bg-muted p-3 transition-all duration-300', !sidebarOpen && 'p-1')}>
            {sidebarOpen ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Crypto Analytics
                </p>
                <p className="text-xs font-medium">v1.0.0</p>
              </>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center">
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
