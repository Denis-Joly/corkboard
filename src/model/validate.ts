/**
 * Load-time validation and repair. Files arrive from sync services, hand
 * edits, and future app versions — never trust disk. Invariants are
 * repaired (with notes), not rejected; unknown keys at every level are
 * preserved and written back verbatim (zod loose objects + spreads).
 *
 * Only structurally hopeless input (not a JSON object at all) throws —
 * the caller then falls back to board.json.bak.
 */
import { z } from 'zod';
import { APP_VERSION, newId } from './factories';
import { SCHEMA_VERSION, type BoardDocument, type Card, type Connection } from './schema';

export interface LoadResult {
  doc: BoardDocument;
  /** Human-readable notes about what had to be fixed. Empty = clean file. */
  repairs: string[];
  /** True when the file was written by a newer schema — never save over it. */
  readOnly: boolean;
}

export class UnreadableBoardError extends Error {}

const MIN_SIZE = 8;
const MAX_ZOOM = 10;
const MIN_ZOOM = 0.02;

function describe(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s === undefined ? String(value) : s.length > 40 ? `${s.slice(0, 40)}…` : s;
  } catch {
    return String(value);
  }
}

export function parseBoardDocument(raw: unknown, fallbackName: string): LoadResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UnreadableBoardError('board.json is not a JSON object');
  }
  const repairs: string[] = [];
  const note = (msg: string) => repairs.push(msg);

  // Field-level schemas: invalid values fall back to a default and leave
  // a repair note. Loose objects pass every unknown key through.
  const str = (name: string, dflt: () => string) =>
    z.string().catch((ctx) => {
      if (ctx.input !== undefined) note(`${name}: ${describe(ctx.input)} → replaced`);
      return dflt();
    });
  const num = (name: string, dflt: number) =>
    z
      .number()
      .refine(Number.isFinite, 'not finite')
      .catch((ctx) => {
        if (ctx.input !== undefined) note(`${name}: ${describe(ctx.input)} → ${dflt}`);
        return dflt;
      });

  const nowIso = () => new Date().toISOString();

  const cardSchema = z.looseObject({
    id: str('card.id', newId),
    type: str('card.type', () => 'text'),
    x: num('card.x', 0),
    y: num('card.y', 0),
    w: num('card.w', 240),
    h: num('card.h', 56),
    color: str('card.color', () => 'paper'),
    z: num('card.z', 0),
    createdAt: str('card.createdAt', nowIso),
  });

  const connectionSchema = z.looseObject({
    id: str('connection.id', newId),
    from: z.string().catch(''),
    to: z.string().catch(''),
    label: z.string().nullable().catch(null),
    color: z.string().nullable().catch(null),
    kind: str('connection.kind', () => 'string'),
    createdAt: str('connection.createdAt', nowIso),
  });

  const viewportSchema = z.looseObject({
    x: num('viewport.x', 0),
    y: num('viewport.y', 0),
    zoom: num('viewport.zoom', 1),
  });

  const topSchema = z.looseObject({
    schemaVersion: z.number().int().catch((ctx) => {
      note(`schemaVersion: ${describe(ctx.input)} → ${SCHEMA_VERSION}`);
      return SCHEMA_VERSION;
    }),
    appVersion: z.string().catch(APP_VERSION),
    id: str('board.id', newId),
    name: str('board.name', () => fallbackName),
    createdAt: str('board.createdAt', nowIso),
    modifiedAt: str('board.modifiedAt', nowIso),
    viewport: viewportSchema.catch(() => {
      note('viewport missing/invalid → reset');
      return { x: 0, y: 0, zoom: 1 };
    }),
    cards: z.array(z.unknown()).catch((ctx) => {
      if (ctx.input !== undefined) note('cards is not an array → []');
      return [];
    }),
    connections: z.array(z.unknown()).catch((ctx) => {
      if (ctx.input !== undefined) note('connections is not an array → []');
      return [];
    }),
  });

  const top = topSchema.parse(raw);
  const readOnly = top.schemaVersion > SCHEMA_VERSION;

  // --- Cards: repair base geometry, keep type-specific payloads verbatim ---
  const cards: Card[] = [];
  const seenCardIds = new Set<string>();
  for (const entry of top.cards) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      note(`dropped non-object card entry: ${describe(entry)}`);
      continue;
    }
    const card = cardSchema.parse(entry) as unknown as Card;
    if (seenCardIds.has(card.id)) {
      const fresh = newId();
      note(`duplicate card id ${card.id} → re-identified as ${fresh}`);
      card.id = fresh;
    }
    seenCardIds.add(card.id);
    card.w = Math.max(card.w, MIN_SIZE);
    card.h = Math.max(card.h, MIN_SIZE);
    if (card.type === 'text' && typeof (card as { text?: unknown }).text !== 'string') {
      note(`card ${card.id}: text missing → ""`);
      (card as { text: string }).text = '';
    }
    cards.push(card);
  }

  // --- Connections: drop dangling/self references, dedupe ids ---
  const connections: Connection[] = [];
  const seenConnIds = new Set<string>();
  for (const entry of top.connections) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      note(`dropped non-object connection entry: ${describe(entry)}`);
      continue;
    }
    const conn = connectionSchema.parse(entry) as unknown as Connection;
    if (!seenCardIds.has(conn.from) || !seenCardIds.has(conn.to)) {
      note(`dropped connection ${conn.id}: endpoint missing (${conn.from} → ${conn.to})`);
      continue;
    }
    if (conn.from === conn.to) {
      note(`dropped self-connection ${conn.id}`);
      continue;
    }
    if (seenConnIds.has(conn.id)) {
      const fresh = newId();
      note(`duplicate connection id ${conn.id} → re-identified as ${fresh}`);
      conn.id = fresh;
    }
    seenConnIds.add(conn.id);
    connections.push(conn);
  }

  const viewport = top.viewport;
  viewport.zoom = Math.min(Math.max(viewport.zoom, MIN_ZOOM), MAX_ZOOM);

  // Spread the raw object first so unknown top-level keys round-trip.
  const doc: BoardDocument = {
    ...(raw as Record<string, unknown>),
    ...top,
    viewport,
    cards,
    connections,
  } as BoardDocument;

  return { doc, repairs, readOnly };
}
