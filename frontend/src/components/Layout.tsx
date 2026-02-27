import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useStore } from '@/store';
import { clsx } from 'clsx';

export function Layout() {
  const { sidebarOpen } = useStore();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={clsx(
          'transition-all duration-300',
          sidebarOpen ? 'md:ml-64' : 'md:ml-0'
        )}
      >
        <Header />
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}