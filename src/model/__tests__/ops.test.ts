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
