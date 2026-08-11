import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage,
  });
});
import { newBoard, newTextCard } from '../../model/factories';
import { addCards, frameCards, getCard, resizeCard, setGroup } from '../../model/ops';
import {
  applyNodeSelectionChanges,
  commitTextEditor,
  fitSelectedFrames,
} from '../actions';
import { boardTemporal, useBoardStore } from '../boardStore';
import { loadDocument, setSaveScheduler, undo } from '../history';
import { useUiStore } from '../uiStore';

afterEach(() => {
  setSaveScheduler(() => {});
  loadDocument(newBoard('Test cleanup'), null, false);
});

describe('text editor history', () => {
  it('commits combined content and alignment as one undo and one save', () => {
    let doc = newBoard('Editor');
    const card = newTextCard({ x: 0, y: 0, z: 10 }, 'before');
    doc = addCards(doc, [card]);
    loadDocument(doc, null, false);
    useUiStore.getState().setEditingCard(card.id);
    let saves = 0;
    setSaveScheduler(() => {
      saves += 1;
    });

    commitTextEditor(card, false, '**after**', 80, 'center', true);

    expect(saves).toBe(1);
    expect(boardTemporal().pastStates).toHaveLength(1);
    expect(useBoardStore.getState().doc.cards[0]).toMatchObject({
      text: '**after**',
      h: 80,
      textAlign: 'center',
    });
    undo();
    expect(useBoardStore.getState().doc.cards[0]).toBe(card);
  });

  it('does not create history or save an unchanged editor session', () => {
    let doc = newBoard('Editor no-op');
    const card = newTextCard({ x: 0, y: 0, z: 10 }, 'same');
    doc = addCards(doc, [card]);
    loadDocument(doc, null, false);
    let saves = 0;
    setSaveScheduler(() => {
      saves += 1;
    });

    commitTextEditor(card, false, card.text, card.h, 'left', false);

    expect(saves).toBe(0);
    expect(boardTemporal().pastStates).toHaveLength(0);
    expect(useBoardStore.getState().doc).toBe(doc);
  });
});

describe('frame fitting history', () => {
  it('fits selected frames as one undo and one save', () => {
    let doc = newBoard('Frame fit');
    const a = newTextCard({ x: 0, y: 0, z: 10 }, 'A');
    const b = newTextCard({ x: 400, y: 160, z: 20 }, 'B');
    doc = addCards(doc, [a, b]);
    const framed = frameCards(doc, [a.id, b.id]);
    const frame = framed.frame!;
    doc = resizeCard(framed.doc, frame.id, { x: 50, y: 50, w: 250, h: 180 });
    const distorted = getCard(doc, frame.id)!;
    loadDocument(doc, null, false);
    useUiStore.getState().setSelection([frame.id]);
    let saves = 0;
    setSaveScheduler(() => {
      saves += 1;
    });

    fitSelectedFrames();

    expect(saves).toBe(1);
    expect(boardTemporal().pastStates).toHaveLength(1);
    expect(getCard(useBoardStore.getState().doc, frame.id)).not.toBe(distorted);
    undo();
    expect(getCard(useBoardStore.getState().doc, frame.id)).toBe(distorted);
  });
});

describe('node selection routing', () => {
  it('accumulates, toggles, and replaces selections without history or saves', () => {
    let doc = newBoard('Multiple selection');
    const a = newTextCard({ x: 0, y: 0, z: 10 }, 'A');
    const b = newTextCard({ x: 300, y: 0, z: 20 }, 'B');
    const c = newTextCard({ x: 600, y: 0, z: 30 }, 'C');
    const d = newTextCard({ x: 900, y: 0, z: 40 }, 'D');
    doc = addCards(doc, [a, b, c, d]);
    loadDocument(doc, null, false);
    useUiStore.getState().setSelection([], ['edge-1']);
    let saves = 0;
    setSaveScheduler(() => {
      saves += 1;
    });

    applyNodeSelectionChanges([{ id: a.id, selected: true }]);
    applyNodeSelectionChanges([{ id: b.id, selected: true }]);
    applyNodeSelectionChanges([{ id: c.id, selected: true }]);
    expect(useUiStore.getState().selection).toEqual(new Set([a.id, b.id, c.id]));
    expect(useUiStore.getState().edgeSelection).toEqual(new Set(['edge-1']));

    applyNodeSelectionChanges([{ id: b.id, selected: false }]);
    expect(useUiStore.getState().selection).toEqual(new Set([a.id, c.id]));
    applyNodeSelectionChanges([{ id: b.id, selected: true }]);
    expect(useUiStore.getState().selection).toEqual(new Set([a.id, c.id, b.id]));

    // React Flow emits one replacement batch for a plain click on D.
    applyNodeSelectionChanges([
      { id: a.id, selected: false },
      { id: b.id, selected: false },
      { id: c.id, selected: false },
      { id: d.id, selected: true },
    ]);
    expect(useUiStore.getState().selection).toEqual(new Set([d.id]));
    expect(boardTemporal().pastStates).toHaveLength(0);
    expect(saves).toBe(0);
  });

  it('adds an entire group but allows one selected member to be toggled off', () => {
    let doc = newBoard('Grouped multiple selection');
    const a = newTextCard({ x: 0, y: 0, z: 10 }, 'A');
    const b = newTextCard({ x: 300, y: 0, z: 20 }, 'B');
    const outside = newTextCard({ x: 600, y: 0, z: 30 }, 'Outside');
    doc = setGroup(addCards(doc, [a, b, outside]), [a.id, b.id], 'group-1');
    loadDocument(doc, null, false);

    applyNodeSelectionChanges([{ id: outside.id, selected: true }]);
    applyNodeSelectionChanges([{ id: a.id, selected: true }]);
    expect(useUiStore.getState().selection).toEqual(new Set([outside.id, a.id, b.id]));

    applyNodeSelectionChanges([{ id: a.id, selected: false }]);
    expect(useUiStore.getState().selection).toEqual(new Set([outside.id, b.id]));
  });

  it('adds a complete framed group and can toggle only its boundary off', () => {
    let doc = newBoard('Framed multiple selection');
    const a = newTextCard({ x: 0, y: 0, z: 10 }, 'A');
    const b = newTextCard({ x: 300, y: 0, z: 20 }, 'B');
    const outside = newTextCard({ x: 700, y: 0, z: 30 }, 'Outside');
    const framed = frameCards(addCards(doc, [a, b, outside]), [a.id, b.id]);
    doc = framed.doc;
    const frame = framed.frame!;
    loadDocument(doc, null, false);

    applyNodeSelectionChanges([{ id: outside.id, selected: true }]);
    applyNodeSelectionChanges([{ id: a.id, selected: true }]);
    expect(useUiStore.getState().selection).toEqual(
      new Set([outside.id, a.id, b.id, frame.id]),
    );

    applyNodeSelectionChanges([{ id: frame.id, selected: false }]);
    expect(useUiStore.getState().selection).toEqual(new Set([outside.id, a.id, b.id]));
  });
});
