import { v7 } from 'uuid';

/**
 * New entity ID: a UUID v7 (time-ordered, so IDs sort by creation). Generated in the app so an
 * entity has its identity before it is saved; columns also default to Postgres' `uuidv7()`
 * for rows inserted by hand.
 */
export const newId = (): string => v7();
