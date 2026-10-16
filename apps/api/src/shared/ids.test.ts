import { describe, expect, it } from 'vitest';
import { newId } from './ids.ts';

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('returns a UUID v7', () => {
    expect(newId()).toMatch(uuidV7);
  });

  it('returns IDs that sort in creation order', () => {
    const ids = Array.from({ length: 100 }, newId);

    expect(ids.toSorted()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
