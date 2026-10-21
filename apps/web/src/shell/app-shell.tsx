import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './sidebar.tsx';
import { TopBar } from './top-bar.tsx';

/** The design's desktop shell around every page. */
export const AppShell = () => (
  <div className="flex h-screen overflow-hidden">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col bg-muted">
      <TopBar />
      <main className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-7">
        <Outlet />
      </main>
    </div>
  </div>
);
