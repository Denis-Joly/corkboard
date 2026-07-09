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

  it('a legacy board with connections gains no anchor/group keys on load', () => {
    let doc = newBoard('Legacy');
    doc = addCards(doc, [
      newTextCard({ x: 0, y: 0, z: 10 }),
      newTextCard({ x: 300, y: 0, z: 20 }),
    ]);
    doc = connect(doc, doc.cards[0].id, doc.cards[1].id).doc;
    const json = JSON.stringify(doc, null, 2);
    const { doc: parsed, repairs } = parseBoardDocument(JSON.parse(json), 'Legacy');
    expect(repairs).toEqual([]);
    expect(JSON.stringify(parsed, null, 2)).toBe(json);
    expect('fromAnchor' in parsed.connections[0]).toBe(false);
    expect('toAnchor' in parsed.connections[0]).toBe(false);
    expect('group' in parsed.cards[0]).toBe(false);
  });

  it('keeps unknown keys on connections and inside anchors verbatim', () => {
    let doc = newBoard('ConnRT');
    doc = addCards(doc, [
      newTextCard({ x: 0, y: 0, z: 10 }),
      newTextCard({ x: 300, y: 0, z: 20 }),
    ]);
    const { doc: connected, created } = connect(doc, doc.cards[0].id, doc.cards[1].id, {
      toAnchor: { x: 0.5, y: 0.25 },
    });
    const raw = JSON.parse(JSON.stringify(connected));
    raw.connections[0].futureConnField = { keep: true };
    raw.connections[0].toAnchor.futurePinField = 'keep-me';
    const { doc: parsed, repairs } = parseBoardDocument(raw, 'ConnRT');
    expect(repairs).toEqual([]);
    const conn = JSON.parse(JSON.stringify(parsed)).connections[0];
    expect(conn.id).toBe(created!.id);
    expect(conn.futureConnField).toEqual({ keep: true });
    expect(conn.toAnchor).toEqual({ x: 0.5, y: 0.25, futurePinField: 'keep-me' });
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

  it('repairs anchors: garbage → floating, out-of-range → clamped, absent stays absent', () => {
    let base = newBoard('A');
    base = addCards(base, [
      newTextCard({ x: 0, y: 0, z: 10 }),
      newTextCard({ x: 300, y: 0, z: 20 }),
    ]);
    const [a, b] = base.cards;
    const mk = (id: string, extra: Record<string, unknown>) => ({
      id, from: a.id, to: b.id, label: null, color: null, kind: 'string', createdAt: 'ts', ...extra,
    });
    const raw = JSON.parse(JSON.stringify({
      ...base,
      connections: [
        mk('k1', { fromAnchor: 'garbage', toAnchor: { x: 'a', y: 0 } }),
        mk('k2', { fromAnchor: { x: 1.7, y: -0.4 } }),
        mk('k3', {}),
      ],
    }));
    const { doc, repairs } = parseBoardDocument(raw, 'A');
    const [k1, k2, k3] = doc.connections;
    expect(k1.fromAnchor).toBeNull();
    expect(k1.toAnchor).toBeNull();
    expect(k2.fromAnchor).toEqual({ x: 1, y: 0 });
    expect('fromAnchor' in k3).toBe(false);
    expect(repairs.some((r) => r.includes('k1'))).toBe(true);
    expect(repairs.some((r) => r.includes('clamped'))).toBe(true);
  });

  it('drops a non-string group tag, keeps string tags', () => {
    let base = newBoard('G');
    base = addCards(base, [
      newTextCard({ x: 0, y: 0, z: 10 }),
      newTextCard({ x: 10, y: 0, z: 20 }),
    ]);
    const raw = JSON.parse(JSON.stringify(base));
    raw.cards[0].group = { not: 'a-string' };
    raw.cards[1].group = 'g1';
    const { doc, repairs } = parseBoardDocument(raw, 'G');
    expect('group' in doc.cards[0]).toBe(false);
    expect(doc.cards[1].group).toBe('g1');
    expect(repairs.some((r) => r.includes('group'))).toBe(true);
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
