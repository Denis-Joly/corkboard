import { describe, expect, it } from 'vitest';
import { newBoard, newTextCard, Z_GAP } from '../factories';
import * as ops from '../ops';
import type { BoardDocument, ImageCard } from '../schema';

function boardWith(count: number): BoardDocument {
  let doc = newBoard('Test');
  const cards = Array.from({ length: count }, (_, i) =>
    newTextCard({ x: i * 100, y: 0, z: (i + 1) * Z_GAP }, `card ${i}`),
  );
  doc = ops.addCards(doc, cards);
  return doc;
}

describe('ops are pure', () => {
  it('never mutates the input document', () => {
    const doc = boardWith(2);
    const frozen = JSON.stringify(doc);
    const [a, b] = doc.cards;
    ops.moveCards(doc, [{ id: a.id, x: 5, y: 5 }]);
    ops.deleteCards(doc, [a.id]);
    ops.connect(doc, a.id, b.id);
    ops.setColor(doc, [a.id], 'pink');
    ops.duplicateCards(doc, [a.id]);
    expect(JSON.stringify(doc)).toBe(frozen);
  });
});

describe('moveCards / resizeCard', () => {
  it('moves only the targeted cards', () => {
    const doc = boardWith(2);
    const [a, b] = doc.cards;
    const next = ops.moveCards(doc, [{ id: a.id, x: 50, y: 60 }]);
    expect(ops.getCard(next, a.id)).toMatchObject({ x: 50, y: 60 });
    expect(ops.getCard(next, b.id)).toMatchObject({ x: b.x, y: b.y });
  });

  it('returns the same reference when nothing changes', () => {
    const doc = boardWith(1);
    const a = doc.cards[0];
    expect(ops.moveCards(doc, [{ id: a.id, x: a.x, y: a.y }])).toBe(doc);
    expect(ops.moveCards(doc, [])).toBe(doc);
  });

  it('resizes with position (top-left handles move x/y too)', () => {
    const doc = boardWith(1);
    const a = doc.cards[0];
    const next = ops.resizeCard(doc, a.id, { x: -10, y: -20, w: 300, h: 200 });
    expect(ops.getCard(next, a.id)).toMatchObject({ x: -10, y: -20, w: 300, h: 200 });
  });
});

describe('deleteCards', () => {
  it('cascades connections touching deleted cards', () => {
    let doc = boardWith(3);
    const [a, b, c] = doc.cards;
    doc = ops.connect(doc, a.id, b.id).doc;
    doc = ops.connect(doc, b.id, c.id).doc;
    doc = ops.connect(doc, a.id, c.id).doc;
    const next = ops.deleteCards(doc, [b.id]);
    expect(next.cards).toHaveLength(2);
    expect(next.connections).toHaveLength(1);
    expect(next.connections[0]).toMatchObject({ from: a.id, to: c.id });
  });
});

describe('connect', () => {
  it('rejects self-connections and unknown endpoints', () => {
    const doc = boardWith(2);
    const [a] = doc.cards;
    expect(ops.connect(doc, a.id, a.id).created).toBeUndefined();
    expect(ops.connect(doc, a.id, 'nope').created).toBeUndefined();
  });

  it('detects duplicates in either direction', () => {
    let doc = boardWith(2);
    const [a, b] = doc.cards;
    const first = ops.connect(doc, a.id, b.id);
    doc = first.doc;
    const dup = ops.connect(doc, b.id, a.id);
    expect(dup.duplicateOf).toBe(first.created!.id);
    expect(dup.doc.connections).toHaveLength(1);
  });

  it('stores rounded anchors; anchored connects bypass the duplicate rule', () => {
    let doc = boardWith(2);
    const [a, b] = doc.cards;
    const first = ops.connect(doc, a.id, b.id);
    doc = first.doc;
    // Same pair, but pinned: a second string must be allowed.
    const pinned = ops.connect(doc, a.id, b.id, {
      toAnchor: { x: 0.123456789, y: 0.5 },
    });
    expect(pinned.created).toBeDefined();
    expect(pinned.doc.connections).toHaveLength(2);
    expect(pinned.created!.toAnchor).toEqual({ x: 0.1235, y: 0.5 });
    expect('fromAnchor' in pinned.created!).toBe(false);
    // An existing anchored connection never blocks a new floating one.
    const floating = ops.connect(pinned.doc, b.id, a.id);
    expect(floating.duplicateOf).toBe(first.created!.id);
  });
});

describe('setConnectionEndpoint / unpinConnections', () => {
  it('re-pins, retargets, and refuses self-connections', () => {
    let doc = boardWith(3);
    const [a, b, c] = doc.cards;
    const { doc: connected, created } = ops.connect(doc, a.id, b.id);
    doc = connected;
    const id = created!.id;
    // Re-pin the target end on the same card.
    doc = ops.setConnectionEndpoint(doc, id, 'to', b.id, { x: 0.25, y: 0.75 });
    expect(doc.connections[0].toAnchor).toEqual({ x: 0.25, y: 0.75 });
    // Retarget to another card.
    doc = ops.setConnectionEndpoint(doc, id, 'to', c.id, { x: 0.5, y: 0.5 });
    expect(doc.connections[0]).toMatchObject({ from: a.id, to: c.id });
    // Refuse making it a self-connection (other end is a).
    expect(ops.setConnectionEndpoint(doc, id, 'to', a.id, null)).toBe(doc);
    // Unpin one end: anchor key removed, not nulled.
    doc = ops.setConnectionEndpoint(doc, id, 'to', c.id, null);
    expect('toAnchor' in doc.connections[0]).toBe(false);
  });

  it('no-ops on unchanged endpoint+anchor and unknown ids', () => {
    let doc = boardWith(2);
    const [a, b] = doc.cards;
    const { doc: connected, created } = ops.connect(doc, a.id, b.id, {
      toAnchor: { x: 0.5, y: 0.5 },
    });
    doc = connected;
    expect(ops.setConnectionEndpoint(doc, created!.id, 'to', b.id, { x: 0.5, y: 0.5 })).toBe(doc);
    expect(ops.setConnectionEndpoint(doc, 'nope', 'to', b.id, null)).toBe(doc);
  });

  it('unpinConnections clears both anchors and no-ops when already floating', () => {
    let doc = boardWith(2);
    const [a, b] = doc.cards;
    const { doc: connected, created } = ops.connect(doc, a.id, b.id, {
      fromAnchor: { x: 0.1, y: 0.2 },
      toAnchor: { x: 0.9, y: 0.8 },
    });
    doc = ops.unpinConnections(connected, [created!.id]);
    expect('fromAnchor' in doc.connections[0]).toBe(false);
    expect('toAnchor' in doc.connections[0]).toBe(false);
    expect(ops.unpinConnections(doc, [created!.id])).toBe(doc);
  });
});

describe('z-order', () => {
  it('bringToFront stacks above everything, preserving relative order', () => {
    const doc = boardWith(3);
    const [a, b, c] = doc.cards;
    const next = ops.bringToFront(doc, [a.id, b.id]);
    const za = ops.getCard(next, a.id)!.z;
    const zb = ops.getCard(next, b.id)!.z;
    expect(za).toBeGreaterThan(ops.getCard(next, c.id)!.z);
    expect(zb).toBeGreaterThan(za);
  });
});

describe('duplicateCards', () => {
  it('copies cards with offset and preserves intra-selection connections', () => {
    let doc = boardWith(3);
    const [a, b, c] = doc.cards;
    doc = ops.connect(doc, a.id, b.id).doc;
    doc = ops.connect(doc, a.id, c.id).doc;
    const { doc: next, newCardIds } = ops.duplicateCards(doc, [a.id, b.id]);
    expect(newCardIds).toHaveLength(2);
    expect(next.cards).toHaveLength(5);
    // one copied connection (a-b), the a-c link is not intra-selection
    expect(next.connections).toHaveLength(3);
    const copies = next.cards.filter((card) => newCardIds.includes(card.id));
    expect(copies[0].x).toBe(a.x + 24);
    expect(copies[0].y).toBe(a.y + 24);
    // copies stack above originals
    const originalMax = Math.max(a.z, b.z, c.z);
    for (const copy of copies) expect(copy.z).toBeGreaterThan(originalMax);
  });
});

describe('text and labels', () => {
  it('setText only applies to text cards', () => {
    let doc = boardWith(1);
    const img: ImageCard = {
      id: 'img1', type: 'image', x: 0, y: 0, w: 100, h: 100, color: 'paper', z: 1,
      createdAt: new Date().toISOString(),
      asset: { path: 'assets/x.png', originalName: 'x.png', byteSize: 1, sha256: 'ab', addedAt: '' },
      naturalW: 100, naturalH: 100,
    };
    doc = ops.addCards(doc, [img]);
    const next = ops.setText(doc, 'img1', 'nope');
    expect(next).toBe(doc);
  });

  it('setConnectionColor recolors and no-ops on unchanged values', () => {
    let doc = boardWith(2);
    const [a, b] = doc.cards;
    const { doc: connected, created } = ops.connect(doc, a.id, b.id);
    doc = ops.setConnectionColor(connected, [created!.id], 'blue');
    expect(doc.connections[0].color).toBe('blue');
    expect(ops.setConnectionColor(doc, [created!.id], 'blue')).toBe(doc);
    doc = ops.setConnectionColor(doc, [created!.id], null);
    expect(doc.connections[0].color).toBeNull();
    expect(ops.setConnectionColor(doc, ['missing'], 'red')).toBe(doc);
  });

  it('setConnectionLabel normalizes empty to null', () => {
    let doc = boardWith(2);
    const [a, b] = doc.cards;
    const { doc: connected, created } = ops.connect(doc, a.id, b.id);
    doc = ops.setConnectionLabel(connected, created!.id, '  ');
    expect(doc.connections[0].label).toBeNull();
    doc = ops.setConnectionLabel(doc, created!.id, 'because');
    expect(doc.connections[0].label).toBe('because');
  });
});

describe('no-op gestures return the same reference (no undo entries, no saves)', () => {
  it('setColor / setStyle with unchanged values', () => {
    const doc = boardWith(2);
    const [a] = doc.cards;
    expect(ops.setColor(doc, [a.id], a.color)).toBe(doc);
    expect(ops.setStyle(doc, [a.id], 'note')).toBe(doc);
    expect(ops.setColor(doc, ['missing'], 'pink')).toBe(doc);
  });

  it('deleteCards / deleteConnections with no matches', () => {
    const doc = boardWith(2);
    expect(ops.deleteCards(doc, ['nope'])).toBe(doc);
    expect(ops.deleteConnections(doc, ['nope'])).toBe(doc);
  });

  it('bringToFront with no matching ids', () => {
    const doc = boardWith(1);
    expect(ops.bringToFront(doc, ['nope'])).toBe(doc);
    expect(ops.bringToFront(doc, [])).toBe(doc);
  });
});

describe('referencedAssetPaths', () => {
  it('collects unique asset paths from image and file cards', () => {
    let doc = boardWith(1);
    const asset = { path: 'assets/a.png', originalName: 'a.png', byteSize: 1, sha256: 'aa', addedAt: '' };
    doc = ops.addCards(doc, [
      { id: 'i1', type: 'image', x: 0, y: 0, w: 10, h: 10, color: 'paper', z: 1, createdAt: '', asset, naturalW: 1, naturalH: 1 },
      { id: 'f1', type: 'file', x: 0, y: 0, w: 10, h: 10, color: 'paper', z: 2, createdAt: '', asset },
    ]);
    expect(ops.referencedAssetPaths(doc)).toEqual(['assets/a.png']);
  });
});
