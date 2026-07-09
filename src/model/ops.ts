/**
 * Pure operations on BoardDocument. Every function returns a new document
 * (structural sharing where possible) and never mutates its input — the
 * stores rely on that for snapshot-based undo.
 */
import { newConnection, newId, Z_GAP } from './factories';
import type { BoardDocument, Card, Connection, TextCard, Viewport } from './schema';
import { isTextCard } from './schema';

export function maxZ(doc: BoardDocument): number {
  return doc.cards.reduce((m, c) => Math.max(m, c.z), 0);
}

export function nextZ(doc: BoardDocument): number {
  return maxZ(doc) + Z_GAP;
}

export function getCard(doc: BoardDocument, id: string): Card | undefined {
  return doc.cards.find((c) => c.id === id);
}

export function addCards(doc: BoardDocument, cards: Card[]): BoardDocument {
  if (cards.length === 0) return doc;
  return { ...doc, cards: [...doc.cards, ...cards] };
}

export function updateCard(
  doc: BoardDocument,
  id: string,
  patch: Partial<Card>,
): BoardDocument {
  let changed = false;
  const cards = doc.cards.map((c) => {
    if (c.id !== id) return c;
    changed = true;
    return { ...c, ...patch } as Card;
  });
  return changed ? { ...doc, cards } : doc;
}

export interface CardMove {
  id: string;
  x: number;
  y: number;
}

export function moveCards(doc: BoardDocument, moves: CardMove[]): BoardDocument {
  if (moves.length === 0) return doc;
  const byId = new Map(moves.map((m) => [m.id, m]));
  let changed = false;
  const cards = doc.cards.map((c) => {
    const m = byId.get(c.id);
    if (!m || (m.x === c.x && m.y === c.y)) return c;
    changed = true;
    return { ...c, x: m.x, y: m.y };
  });
  return changed ? { ...doc, cards } : doc;
}

export interface CardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function resizeCard(doc: BoardDocument, id: string, box: CardBox): BoardDocument {
  return updateCard(doc, id, box);
}

export function setText(doc: BoardDocument, id: string, text: string): BoardDocument {
  const card = getCard(doc, id);
  if (!card || !isTextCard(card)) return doc;
  return updateCard(doc, id, { text } satisfies Partial<TextCard>);
}

export function setStyle(doc: BoardDocument, ids: string[], style: string): BoardDocument {
  const set = new Set(ids);
  const cards = doc.cards.map((c) =>
    set.has(c.id) && isTextCard(c) ? { ...c, style } : c,
  );
  return { ...doc, cards };
}

export function setColor(doc: BoardDocument, ids: string[], color: string): BoardDocument {
  const set = new Set(ids);
  const cards = doc.cards.map((c) => (set.has(c.id) ? { ...c, color } : c));
  return { ...doc, cards };
}

/** Delete cards and cascade their connections — one atomic change. */
export function deleteCards(doc: BoardDocument, ids: string[]): BoardDocument {
  if (ids.length === 0) return doc;
  const gone = new Set(ids);
  return {
    ...doc,
    cards: doc.cards.filter((c) => !gone.has(c.id)),
    connections: doc.connections.filter((k) => !gone.has(k.from) && !gone.has(k.to)),
  };
}

export function bringToFront(doc: BoardDocument, ids: string[]): BoardDocument {
  if (ids.length === 0) return doc;
  const set = new Set(ids);
  let z = nextZ(doc);
  const cards = doc.cards.map((c) => {
    if (!set.has(c.id)) return c;
    const next = { ...c, z };
    z += Z_GAP;
    return next;
  });
  return { ...doc, cards };
}

export interface ConnectResult {
  doc: BoardDocument;
  /** Set when a new connection was created. */
  created?: Connection;
  /** Set when an equivalent connection (either direction) already existed. */
  duplicateOf?: string;
}

export function connect(doc: BoardDocument, from: string, to: string): ConnectResult {
  if (from === to) return { doc };
  if (!getCard(doc, from) || !getCard(doc, to)) return { doc };
  const existing = doc.connections.find(
    (k) => (k.from === from && k.to === to) || (k.from === to && k.to === from),
  );
  if (existing) return { doc, duplicateOf: existing.id };
  const created = newConnection(from, to);
  return { doc: { ...doc, connections: [...doc.connections, created] }, created };
}

export function setConnectionLabel(
  doc: BoardDocument,
  id: string,
  label: string | null,
): BoardDocument {
  const normalized = label && label.trim().length > 0 ? label : null;
  let changed = false;
  const connections = doc.connections.map((k) => {
    if (k.id !== id || k.label === normalized) return k;
    changed = true;
    return { ...k, label: normalized };
  });
  return changed ? { ...doc, connections } : doc;
}

export function deleteConnections(doc: BoardDocument, ids: string[]): BoardDocument {
  if (ids.length === 0) return doc;
  const gone = new Set(ids);
  return { ...doc, connections: doc.connections.filter((k) => !gone.has(k.id)) };
}

export function setViewport(doc: BoardDocument, viewport: Viewport): BoardDocument {
  return { ...doc, viewport };
}

export interface DuplicateResult {
  doc: BoardDocument;
  newCardIds: string[];
}

/**
 * Duplicate cards (and the connections between them), offset on the canvas.
 * New cards land above everything else, preserving relative stacking.
 */
export function duplicateCards(
  doc: BoardDocument,
  ids: string[],
  offset = { x: 24, y: 24 },
): DuplicateResult {
  const originals = doc.cards
    .filter((c) => ids.includes(c.id))
    .sort((a, b) => a.z - b.z);
  if (originals.length === 0) return { doc, newCardIds: [] };

  const idMap = new Map<string, string>();
  let z = nextZ(doc);
  const copies: Card[] = originals.map((c) => {
    const id = newId();
    idMap.set(c.id, id);
    const copy = {
      ...c,
      id,
      x: c.x + offset.x,
      y: c.y + offset.y,
      z,
      createdAt: new Date().toISOString(),
    } as Card;
    z += Z_GAP;
    return copy;
  });

  const copiedConnections: Connection[] = doc.connections
    .filter((k) => idMap.has(k.from) && idMap.has(k.to))
    .map((k) => ({
      ...k,
      id: newId(),
      from: idMap.get(k.from)!,
      to: idMap.get(k.to)!,
      createdAt: new Date().toISOString(),
    }));

  return {
    doc: {
      ...doc,
      cards: [...doc.cards, ...copies],
      connections: [...doc.connections, ...copiedConnections],
    },
    newCardIds: copies.map((c) => c.id),
  };
}

/** All asset paths referenced by the document (for the orphan sweep). */
export function referencedAssetPaths(doc: BoardDocument): string[] {
  const paths = new Set<string>();
  for (const card of doc.cards) {
    const asset = (card as { asset?: { path?: unknown } }).asset;
    if (asset && typeof asset.path === 'string') paths.add(asset.path);
  }
  return [...paths];
}
