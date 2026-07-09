import { describe, expect, it } from 'vitest';
import { migrateRaw, type Migration } from '../migrations';

const fakeLadder: Migration[] = [
  { from: 1, migrate: (raw) => ({ ...raw, addedInV2: true }) },
  { from: 2, migrate: (raw) => ({ ...raw, addedInV3: true }) },
];

describe('migration ladder', () => {
  it('runs no migrations for a current document', () => {
    const result = migrateRaw({ schemaVersion: 3, cards: [] }, fakeLadder, 3);
    expect(result.migrated).toBe(false);
    expect(result.fromVersion).toBe(3);
  });

  it('steps through multiple versions in order', () => {
    const result = migrateRaw({ schemaVersion: 1, keep: 'me' }, fakeLadder, 3);
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe(1);
    expect(result.raw).toMatchObject({
      schemaVersion: 3,
      keep: 'me',
      addedInV2: true,
      addedInV3: true,
    });
  });

  it('stops at a gap in the ladder instead of crashing', () => {
    const gappy: Migration[] = [{ from: 2, migrate: (r) => r }];
    const result = migrateRaw({ schemaVersion: 0 }, gappy, 3);
    expect(result.migrated).toBe(false);
    expect((result.raw as { schemaVersion: number }).schemaVersion).toBe(0);
  });

  it('passes non-object input through untouched', () => {
    const result = migrateRaw('garbage', fakeLadder, 3);
    expect(result.raw).toBe('garbage');
    expect(result.migrated).toBe(false);
  });

  it('the real ladder is empty at v1 (guard against accidental entries)', () => {
    const result = migrateRaw({ schemaVersion: 1 });
    expect(result.migrated).toBe(false);
  });
});
