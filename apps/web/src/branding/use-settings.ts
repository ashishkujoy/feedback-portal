import { useQuery } from '@tanstack/react-query';
import { settingsQuery } from '../api/settings.ts';

/** The configured names; `undefined` while loading or when `/settings` failed. */
export const useSettings = () => useQuery(settingsQuery).data;
