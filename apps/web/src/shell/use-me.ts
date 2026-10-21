import { useQuery } from '@tanstack/react-query';
import { meQuery } from '../api/me.ts';

/** The signed-in user; `undefined` while loading or on error, `null` when signed out. */
export const useMe = () => useQuery(meQuery).data;
