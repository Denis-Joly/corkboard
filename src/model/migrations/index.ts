/**
 * Migration ladder for breaking schema changes. Runs on the RAW parsed
 * JSON before validation/repair, stepping from the file's version up to
 * SCHEMA_VERSION one migration at a time.
 *
 * Rules (see schema.ts contract): additive changes never land here.
 * Every future migration must ship with round-trip fixture tests that
 * stay in the repo forever, and callers snapshot the original file to
 * .backups/ before saving a migrated document.
 */
import { SCHEMA_VERSION } from '../schema';

export interface Migration {
  /** Migrates a document whose schemaVersion === from, to from + 1. */
  from: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/** Ordered ladder; v1 is current, so it's empty today. */
export const MIGRATIONS: Migration[] = [];

export interface MigrationResult {
  raw: unknown;
  /** True when at least one migration ran (caller must snapshot first). */
  migrated: boolean;
  fromVersion: number;
}

export function migrateRaw(
  raw: unknown,
  ladder: Migration[] = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { raw, migrated: false, fromVersion: target };
  }
  let current = raw as Record<string, unknown>;
  const version = typeof current.schemaVersion === 'number' ? current.schemaVersion : target;
  let at = version;
  let migrated = false;
  while (at < target) {
    const step = ladder.find((m) => m.from === at);
    if (!step) break; // gap in the ladder — let repair handle what it can
    current = { ...step.migrate(current), schemaVersion: at + 1 };
    at += 1;
    migrated = true;
  }
  return { raw: current, migrated, fromVersion: version };
}
