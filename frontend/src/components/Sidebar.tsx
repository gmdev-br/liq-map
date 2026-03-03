import { NavLink } from 'react-router-dom';
import { useStore } from '@/store';
import { clsx } from 'clsx';
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

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/liquidation-test', icon: FlaskConical, label: 'Teste Liquidação' },
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
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'glass-sidebar fixed top-0 left-0 z-50 h-screen transition-all duration-500 ease-liquid',
          sidebarOpen ? 'w-72' : 'w-20'
        )}
      >
        {/* Logo Section */}
        <div className="flex h-16 items-center justify-between border-b border-white/5 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-liquid bg-gradient-to-br from-blue-500 to-purple-600 shadow-glow">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <span 
              className={clsx(
                'text-xl font-bold text-gradient transition-all duration-500',
                sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none absolute'
              )}
            >
              Coinglass
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-all duration-300"
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item, index) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 rounded-liquid-sm px-3 py-3 text-sm font-medium transition-all duration-300',
                  isActive
                    ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/10 text-white border border-blue-500/20 shadow-glow'
                    : 'text-white/60 hover:bg-white/5 hover:text-white hover:border hover:border-white/10'
                )
              }
              style={{ animationDelay: `${index * 50}ms` }}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className={clsx(
                'h-5 w-5 flex-shrink-0 transition-all duration-300',
                'group-hover:scale-110'
              )} />
              <span 
                className={clsx(
                  'transition-all duration-500 whitespace-nowrap',
                  sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none absolute'
                )}
              >
                {item.label}
              </span>
              {sidebarOpen && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 p-4">
          <div 
            className={clsx(
              'glass-card transition-all duration-500',
              sidebarOpen ? 'p-4' : 'p-2 flex items-center justify-center'
            )}
          >
            {sidebarOpen ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20">
                  <Activity className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-white/50">Crypto Analytics</p>
                  <p className="text-sm font-semibold text-white">v1.0.0</p>
                </div>
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20">
                <Activity className="h-5 w-5 text-green-400" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
