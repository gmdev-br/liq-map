import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useStore } from '@/store';
import { clsx } from 'clsx';

export function Layout() {
  const { sidebarOpen } = useStore();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div 
        className={clsx(
          'transition-all duration-500 ease-liquid min-h-screen',
          sidebarOpen ? 'md:ml-72' : 'md:ml-20'
        )}
      >
        <Header />
        <main className="p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
