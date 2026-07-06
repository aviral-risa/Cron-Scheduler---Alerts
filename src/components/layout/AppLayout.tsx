import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      {/* Main content with left margin for sidebar - shifts on sidebar hover */}
      <div className="ml-16 peer-hover:ml-60 transition-all duration-300">
        <main className="max-w-[1600px] mx-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
