import { NavLink } from 'react-router-dom';
import { useStore } from '@/store';
import { clsx } from 'clsx';
import { useMemo } from 'react';
import {
  LayoutDashboard,
  Building2,
  Bell,
  Settings,
  TrendingUp,
  Activity,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useStore();

  // Memoized nav items to prevent unnecessary re-renders
  const navItems = useMemo(() => [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/liquidation-test', icon: FlaskConical, label: 'Teste Liquidação' },
    { path: '/exchanges', icon: Building2, label: 'Exchanges' },
    { path: '/alerts', icon: Bell, label: 'Alerts' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ], []);

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'glass-sidebar fixed top-0 left-0 z-50 h-screen transition-all duration-200',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        {/* Logo Section */}
        <div className="flex h-14 items-center justify-between border-b border-white/5 px-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span
              className={clsx(
                'text-lg font-bold text-gradient transition-opacity duration-200',
                sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'
              )}
            >
              Coinglass
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-500/20 text-white border border-blue-500/20'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                )
              }
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span
                className={clsx(
                  'transition-opacity duration-200 whitespace-nowrap',
                  sidebarOpen ? 'opacity-100' : 'opacity-0 hidden'
                )}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 p-2">
          <div
            className={clsx(
              'glass-card',
              sidebarOpen ? 'p-3' : 'p-1.5 flex items-center justify-center'
            )}
          >
            {sidebarOpen ? (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20 border border-green-500/20">
                  <Activity className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-white/50">Crypto Analytics</p>
                  <p className="text-sm font-semibold text-white">v1.0.0</p>
                </div>
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20 border border-green-500/20">
                <Activity className="h-4 w-4 text-green-400" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
