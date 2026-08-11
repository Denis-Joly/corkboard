import { describe, expect, it } from 'vitest';
import {
  FRAME_PADDING_BOTTOM,
  FRAME_PADDING_TOP,
  FRAME_PADDING_X,
  newBoard,
  newTextCard,
  Z_GAP,
} from '../factories';
import * as ops from '../ops';
import { isFrameCard, type BoardDocument, type ImageCard } from '../schema';

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

  it('commits text, height, and alignment atomically', () => {
    const doc = boardWith(1);
    const card = doc.cards[0];
    const centered = ops.updateTextContent(doc, card.id, {
      text: 'formatted',
      h: 88,
      textAlign: 'center',
    });
    expect(ops.getCard(centered, card.id)).toMatchObject({
      text: 'formatted',
      h: 88,
      textAlign: 'center',
    });
    expect(ops.getCard(doc, card.id)).not.toHaveProperty('textAlign');
    expect(
      ops.updateTextContent(centered, card.id, {
        text: 'formatted',
        h: 88,
      }),
    ).toBe(centered);

    const left = ops.updateTextContent(centered, card.id, {
      text: 'formatted',
      h: 88,
      textAlign: 'left',
    });
    expect(ops.getCard(left, card.id)).not.toHaveProperty('textAlign');
    expect(ops.getCard(centered, card.id)).toHaveProperty('textAlign', 'center');
    expect(ops.updateTextContent(doc, 'missing', { text: 'x', h: 24 })).toBe(doc);
  });

  it('preserves an unknown alignment token until the user changes alignment', () => {
    const doc = boardWith(1);
    const card = doc.cards[0];
    const future = ops.updateCard(doc, card.id, { textAlign: 'future-diagonal' });
    const edited = ops.updateTextContent(future, card.id, {
      text: 'new text',
      h: card.h,
    });
    expect(ops.getCard(edited, card.id)).toMatchObject({ textAlign: 'future-diagonal' });
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

describe('setGroup / group remap', () => {
  it('assigns and clears the tag; clearing removes the key', () => {
    let doc = boardWith(3);
    const [a, b, c] = doc.cards;
    doc = ops.setGroup(doc, [a.id, b.id], 'g1');
    expect(ops.getCard(doc, a.id)!.group).toBe('g1');
    expect(ops.getCard(doc, b.id)!.group).toBe('g1');
    expect('group' in ops.getCard(doc, c.id)!).toBe(false);
    expect(ops.setGroup(doc, [a.id], 'g1')).toBe(doc); // unchanged → same ref
    doc = ops.setGroup(doc, [a.id, b.id], null);
    expect('group' in ops.getCard(doc, a.id)!).toBe(false);
    expect(ops.setGroup(doc, [a.id], null)).toBe(doc);
  });

  it('duplicating grouped cards mints a fresh group for the copies', () => {
    let doc = boardWith(2);
    const [a, b] = doc.cards;
    doc = ops.setGroup(doc, [a.id, b.id], 'g1');
    const { doc: next, newCardIds } = ops.duplicateCards(doc, [a.id, b.id]);
    const copies = next.cards.filter((c) => newCardIds.includes(c.id));
    expect(copies[0].group).toBeDefined();
    expect(copies[0].group).not.toBe('g1');
    expect(copies[1].group).toBe(copies[0].group);
    // Originals untouched.
    expect(ops.getCard(next, a.id)!.group).toBe('g1');
  });
});

describe('frames', () => {
  it('creates a padded boundary behind two cards and groups all three', () => {
    const doc = boardWith(3);
    const [a, b, untouched] = doc.cards;
    const result = ops.frameCards(doc, [a.id, b.id], 'Evidence');
    const frame = result.frame!;

    expect(isFrameCard(frame)).toBe(true);
    expect(frame.title).toBe('Evidence');
    expect(frame.x).toBe(Math.min(a.x, b.x) - FRAME_PADDING_X);
    expect(frame.y).toBe(Math.min(a.y, b.y) - FRAME_PADDING_TOP);
    expect(frame.w).toBe(Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x) + FRAME_PADDING_X * 2);
    expect(frame.h).toBe(
      Math.max(a.y + a.h, b.y + b.h) -
        Math.min(a.y, b.y) +
        FRAME_PADDING_TOP +
        FRAME_PADDING_BOTTOM,
    );
    expect(frame.z).toBeLessThan(Math.min(a.z, b.z));
    expect(ops.getCard(result.doc, a.id)!.group).toBe(frame.group);
    expect(ops.getCard(result.doc, b.id)!.group).toBe(frame.group);
    expect(ops.getCard(result.doc, untouched.id)!.group).toBeUndefined();
  });

  it('requires two non-frame cards and removes only the boundary when unframing', () => {
    const doc = boardWith(2);
    expect(ops.frameCards(doc, [doc.cards[0].id]).doc).toBe(doc);

    const framed = ops.frameCards(doc, doc.cards.map((c) => c.id));
    const frame = framed.frame!;
    const unframed = ops.removeFrames(framed.doc, [frame.id]);
    expect(unframed.cards).toHaveLength(2);
    expect(unframed.cards.every((c) => c.group === undefined)).toBe(true);
    expect(ops.removeFrames(unframed, ['missing'])).toBe(unframed);
  });

  it('allows one inflow or outflow total and enforces the limit when retargeting', () => {
    let doc = boardWith(4);
    const [a, b, c, d] = doc.cards;
    const framed = ops.frameCards(doc, [a.id, b.id]);
    doc = framed.doc;
    const frame = framed.frame!;

    const outflow = ops.connect(doc, frame.id, c.id);
    expect(outflow.created).toMatchObject({ from: frame.id, to: c.id });
    doc = outflow.doc;
    const repinnedFrame = ops.setConnectionEndpoint(
      doc,
      outflow.created!.id,
      'from',
      frame.id,
      { x: 0.25, y: 0.25 },
    );
    expect(repinnedFrame.connections.find((k) => k.id === outflow.created!.id)!.fromAnchor).toEqual(
      { x: 0.25, y: 0.25 },
    );
    const movedOffFrame = ops.setConnectionEndpoint(
      repinnedFrame,
      outflow.created!.id,
      'from',
      d.id,
      null,
    );
    expect(ops.connect(movedOffFrame, frame.id, c.id).created).toBeDefined();

    const blocked = ops.connect(doc, d.id, frame.id);
    expect(blocked.doc).toBe(doc);
    expect(blocked.frameAtCapacity).toBe(frame.id);

    const other = ops.connect(doc, c.id, d.id);
    doc = other.doc;
    expect(ops.setConnectionEndpoint(doc, other.created!.id, 'to', frame.id, null)).toBe(doc);
    // Retargeting the frame's own connection remains allowed.
    const retargeted = ops.setConnectionEndpoint(doc, outflow.created!.id, 'to', d.id, null);
    expect(retargeted.connections.find((k) => k.id === outflow.created!.id)!.to).toBe(d.id);

    const freed = ops.deleteConnections(doc, [outflow.created!.id]);
    expect(ops.connect(freed, d.id, frame.id).created).toBeDefined();
  });

  it('treats the frame port as an external boundary and fills both frames in a frame link', () => {
    let doc = boardWith(5);
    const [a, b, c, d, outside] = doc.cards;
    const first = ops.frameCards(doc, [a.id, b.id]);
    const second = ops.frameCards(first.doc, [c.id, d.id]);
    doc = second.doc;

    const internal = ops.connect(doc, first.frame!.id, a.id);
    expect(internal.frameMemberBoundary).toBe(first.frame!.id);
    expect(internal.doc).toBe(doc);

    const betweenFrames = ops.connect(doc, first.frame!.id, second.frame!.id);
    expect(betweenFrames.created).toBeDefined();
    expect(ops.connect(betweenFrames.doc, first.frame!.id, outside.id).frameAtCapacity).toBe(
      first.frame!.id,
    );
    expect(ops.connect(betweenFrames.doc, outside.id, second.frame!.id).frameAtCapacity).toBe(
      second.frame!.id,
    );
  });

  it('duplicates a frame and its contents as a separate framed group', () => {
    const base = boardWith(2);
    const framed = ops.frameCards(base, base.cards.map((c) => c.id));
    const ids = framed.doc.cards.map((c) => c.id);
    const duplicated = ops.duplicateCards(framed.doc, ids);
    const copies = duplicated.doc.cards.filter((c) => duplicated.newCardIds.includes(c.id));
    const copiedFrame = copies.find(isFrameCard)!;
    expect(copiedFrame).toBeDefined();
    expect(copiedFrame.group).not.toBe(framed.frame!.group);
    expect(copies.every((c) => c.group === copiedFrame.group)).toBe(true);
  });

  it('keeps a frame beneath its members even after z-order changes', () => {
    const base = boardWith(2);
    const framed = ops.frameCards(base, base.cards.map((c) => c.id));
    const raised = ops.bringToFront(framed.doc, framed.doc.cards.map((c) => c.id));
    const frame = raised.cards.find(isFrameCard)!;
    const memberZs = raised.cards.filter((c) => !isFrameCard(c)).map((c) => ops.effectiveCardZ(raised, c));
    expect(ops.effectiveCardZ(raised, frame)).toBeLessThan(Math.min(...memberZs));
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
