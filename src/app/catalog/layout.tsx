import type { ReactNode } from 'react';
import { Sidebar } from '@/components/workspace/Sidebar';

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#07111f] text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar />
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </div>
    </main>
  );
}

