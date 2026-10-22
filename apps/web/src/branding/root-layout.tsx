import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useSettings } from './use-settings.ts';

/** Every page: names the browser tab after the program once `/settings` has loaded. */
export const RootLayout = () => {
  const programName = useSettings()?.programName;
  useEffect(() => {
    if (programName) document.title = `${programName} · Mentor portal`;
  }, [programName]);
  return <Outlet />;
};
