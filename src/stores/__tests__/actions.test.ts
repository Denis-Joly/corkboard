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
import { addCards, frameCards, getCard, resizeCard } from '../../model/ops';
import { commitTextEditor, fitSelectedFrames } from '../actions';
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
