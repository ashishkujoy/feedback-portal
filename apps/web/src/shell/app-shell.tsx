import { Navigate, Outlet } from '@tanstack/react-router';
import { Sidebar } from './sidebar.tsx';
import { TopBar } from './top-bar.tsx';
import { useMe } from './use-me.ts';

/** The design's desktop shell around every page. Leaves for sign-in if `/me` says signed out. */
export const AppShell = () => {
  // The route guard covers navigation; this covers a refetch of `/me` finding the session gone.
  if (useMe() === null) return <Navigate to="/login" />;
  return (
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
};
