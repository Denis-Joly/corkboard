import { describe, expect, it } from 'vitest';
import { newBoard, newTextCard } from '../factories';
import { addCards, connect } from '../ops';
import { SCHEMA_VERSION } from '../schema';
import { parseBoardDocument, UnreadableBoardError } from '../validate';

describe('round-trip preservation', () => {
  it('keeps unknown keys at every level (newer-app data survives)', () => {
    let doc = newBoard('RT');
    doc = addCards(doc, [newTextCard({ x: 0, y: 0, z: 10 }, 'hi')]);
    const withExtras = {
      ...doc,
      futureTopLevel: { nested: [1, 2, 3] },
      meta: { pluginData: 'x' },
      cards: [{ ...doc.cards[0], futureCardField: 'keep-me' }],
    };
    const { doc: parsed, repairs } = parseBoardDocument(
      JSON.parse(JSON.stringify(withExtras)),
      'fallback',
    );
    expect(repairs).toEqual([]);
    const reserialized = JSON.parse(JSON.stringify(parsed));
    expect(reserialized.futureTopLevel).toEqual({ nested: [1, 2, 3] });
    expect(reserialized.meta).toEqual({ pluginData: 'x' });
    expect(reserialized.cards[0].futureCardField).toBe('keep-me');
  });

  it('keeps unknown card types verbatim, movable geometry repaired', () => {
    const raw = {
      ...newBoard('X'),
      cards: [
        {
          id: 'u1', type: 'mindmap-cluster', x: 1, y: 2, w: 100, h: 100,
          color: 'paper', z: 5, createdAt: 'ts', payload: { deep: true },
        },
      ],
    };
    const { doc } = parseBoardDocument(JSON.parse(JSON.stringify(raw)), 'X');
    expect(doc.cards[0].type).toBe('mindmap-cluster');
    expect((doc.cards[0] as Record<string, unknown>).payload).toEqual({ deep: true });
  });

  it('a clean save/load cycle is byte-stable', () => {
    let doc = newBoard('Stable');
    doc = addCards(doc, [newTextCard({ x: 5, y: 5, z: 10 }, 'note')]);
    const json = JSON.stringify(doc, null, 2);
    const { doc: parsed, repairs } = parseBoardDocument(JSON.parse(json), 'Stable');
    expect(repairs).toEqual([]);
    expect(JSON.stringify(parsed, null, 2)).toBe(json);
  });
});

describe('repair, not reject', () => {
  it('repairs NaN/invalid geometry and missing fields with notes', () => {
    const { doc, repairs } = parseBoardDocument(
      {
        schemaVersion: 1,
        cards: [
          { id: 'a', type: 'text', x: 'NaN-ish', y: null, w: -5, h: 20, text: 42 },
          'garbage-entry',
        ],
        connections: 'not-an-array',
      },
      'Repaired',
    );
    expect(doc.name).toBe('Repaired');
    expect(doc.cards).toHaveLength(1);
    const card = doc.cards[0];
    expect(card).toMatchObject({ x: 0, y: 0 });
    expect(card.w).toBeGreaterThan(0);
    expect((card as { text: string }).text).toBe('');
    expect(doc.connections).toEqual([]);
    expect(repairs.length).toBeGreaterThan(0);
  });

  it('drops dangling and self connections, dedupes ids', () => {
    let base = newBoard('C');
    base = addCards(base, [
      newTextCard({ x: 0, y: 0, z: 10 }),
      newTextCard({ x: 10, y: 0, z: 20 }),
    ]);
    const [a, b] = base.cards;
    const { doc: connected, created } = connect(base, a.id, b.id);
    const raw = JSON.parse(JSON.stringify(connected));
    raw.connections.push(
      { ...created, id: created!.id }, // duplicate id
      { id: 'dang', from: a.id, to: 'missing', label: null, color: null, kind: 'string', createdAt: '' },
      { id: 'self', from: a.id, to: a.id, label: null, color: null, kind: 'string', createdAt: '' },
    );
    raw.cards.push({ ...raw.cards[0] }); // duplicate card id
    const { doc, repairs } = parseBoardDocument(raw, 'C');
    expect(doc.cards).toHaveLength(3);
    expect(new Set(doc.cards.map((c) => c.id)).size).toBe(3);
    expect(doc.connections).toHaveLength(2); // original + re-identified duplicate
    expect(new Set(doc.connections.map((k) => k.id)).size).toBe(2);
    expect(repairs.some((r) => r.includes('dang'))).toBe(true);
    expect(repairs.some((r) => r.includes('self'))).toBe(true);
  });

  it('clamps absurd viewport zoom', () => {
    const { doc } = parseBoardDocument(
      { ...newBoard('V'), viewport: { x: 0, y: 0, zoom: 1e9 } },
      'V',
    );
    expect(doc.viewport.zoom).toBeLessThanOrEqual(10);
  });

  it('throws UnreadableBoardError only for hopeless input', () => {
    expect(() => parseBoardDocument('a string', 'X')).toThrow(UnreadableBoardError);
    expect(() => parseBoardDocument(null, 'X')).toThrow(UnreadableBoardError);
    expect(() => parseBoardDocument([1, 2], 'X')).toThrow(UnreadableBoardError);
    expect(() => parseBoardDocument({}, 'X')).not.toThrow();
  });
});

describe('version handling', () => {
  it('flags newer schema versions read-only', () => {
    const { readOnly } = parseBoardDocument(
      { ...newBoard('N'), schemaVersion: SCHEMA_VERSION + 1 },
      'N',
    );
    expect(readOnly).toBe(true);
  });

  it('treats current version as writable', () => {
    const { readOnly } = parseBoardDocument(JSON.parse(JSON.stringify(newBoard('W'))), 'W');
    expect(readOnly).toBe(false);
  });
});
