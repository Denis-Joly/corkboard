/**
 * High-level user actions. Each is one semantic gesture → at most one
 * commitDoc() call → one undo step, one scheduled save.
 */
import {
  newFileCard,
  newImageCard,
  newTextCard,
  DEFAULT_TEXT_HEIGHT,
} from '../model/factories';
import * as ops from '../model/ops';
import type { AnchorPoint, AssetRef, Card, TextCard } from '../model/schema';
import { useBoardStore } from './boardStore';
import { commitDoc } from './history';
import { useUiStore } from './uiStore';

const ui = () => useUiStore.getState();
const doc = () => useBoardStore.getState().doc;

// ---------- text notes ----------

/** The most recently applied color becomes the default for new notes. */
let lastUsedColor = 'paper';

/** Double-click on empty canvas: a draft note, editing immediately.
 *  Enters the document only when committed with content. */
export function createDraftAt(pos: { x: number; y: number }, seedText = '') {
  const draft = newTextCard(
    { x: pos.x, y: pos.y, z: ops.nextZ(doc()), color: lastUsedColor },
    seedText,
  );
  ui().setDraftCard(draft);
}

export function commitTextEditor(card: TextCard, isDraft: boolean, text: string, measuredH: number) {
  const state = ui();
  state.setEditingCard(null);
  if (isDraft) {
    state.setDraftCard(null);
    if (text.trim().length === 0) return;
    const finished = { ...card, text, h: Math.max(measuredH, DEFAULT_TEXT_HEIGHT) };
    if (commitDoc((d) => ops.addCards(d, [finished]))) {
      state.setSelection([finished.id]);
    }
    return;
  }
  if (text.trim().length === 0) {
    commitDoc((d) => ops.deleteCards(d, [card.id]));
    return;
  }
  if (text !== card.text || measuredH !== card.h) {
    commitDoc((d) => ops.updateCard(d, card.id, { text, h: Math.max(measuredH, 24) }));
  }
}

// ---------- geometry ----------

/** Drag end: fold the transient positions of the dragged cards into the
 *  doc and bump them to the front — one atomic entry. */
export function commitMoves(ids: string[]) {
  const state = ui();
  const moves: ops.CardMove[] = [];
  for (const id of ids) {
    const box = state.transient.get(id);
    if (box && box.x !== undefined && box.y !== undefined) {
      moves.push({ id, x: box.x, y: box.y });
    }
  }
  if (moves.length > 0) {
    commitDoc((d) => ops.bringToFront(ops.moveCards(d, moves), moves.map((m) => m.id)));
  }
  state.clearTransient(ids);
}

export function commitResize(id: string) {
  const state = ui();
  const box = state.transient.get(id);
  if (box) {
    commitDoc((d) => {
      const card = ops.getCard(d, id);
      if (!card) return d;
      return ops.resizeCard(d, id, {
        x: box.x ?? card.x,
        y: box.y ?? card.y,
        w: box.w ?? card.w,
        h: box.h ?? card.h,
      });
    });
  }
  state.clearTransient([id]);
}

export function nudgeSelection(dx: number, dy: number) {
  const ids = [...ui().selection];
  if (ids.length === 0) return;
  commitDoc((d) => {
    const moves: ops.CardMove[] = [];
    for (const id of ids) {
      const card = ops.getCard(d, id);
      if (card) moves.push({ id, x: card.x + dx, y: card.y + dy });
    }
    return ops.moveCards(d, moves);
  });
}

// ---------- deletion / selection ----------

/** Delete selected cards AND selected connections in one undo step. */
export function deleteSelection() {
  const state = ui();
  const cardIds = [...state.selection];
  const edgeIds = [...state.edgeSelection];
  if (cardIds.length === 0 && edgeIds.length === 0) return;
  commitDoc((d) => ops.deleteConnections(ops.deleteCards(d, cardIds), edgeIds));
  state.clearSelection();
}

export function deleteById(cardIds: string[], edgeIds: string[]) {
  if (cardIds.length === 0 && edgeIds.length === 0) return;
  commitDoc((d) => ops.deleteConnections(ops.deleteCards(d, cardIds), edgeIds));
}

export function selectAll() {
  ui().setSelection(doc().cards.map((c) => c.id));
}

// ---------- styling ----------

export function applyColor(color: string) {
  lastUsedColor = color;
  const ids = [...ui().selection];
  if (ids.length > 0) commitDoc((d) => ops.setColor(d, ids, color));
}

export function applyTextStyle(style: string) {
  const ids = [...ui().selection];
  if (ids.length > 0) commitDoc((d) => ops.setStyle(d, ids, style));
}

export function bringSelectionToFront() {
  const ids = [...ui().selection];
  if (ids.length > 0) commitDoc((d) => ops.bringToFront(d, ids));
}

// ---------- connections ----------

export function connectCards(
  from: string,
  to: string,
  opts: ops.ConnectOptions = {},
): { duplicateOf?: string } {
  let duplicateOf: string | undefined;
  commitDoc((d) => {
    const result = ops.connect(d, from, to, opts);
    duplicateOf = result.duplicateOf;
    return result.doc;
  });
  return { duplicateOf };
}

export function setConnectionLabel(id: string, label: string | null) {
  ui().setEditingEdge(null);
  commitDoc((d) => ops.setConnectionLabel(d, id, label));
}

/**
 * Drop of a dragged pin: retarget/re-pin one end of a string. One
 * commit; the self-connection refusal explains itself with a toast.
 */
export function retargetConnectionEnd(
  id: string,
  end: 'from' | 'to',
  cardId: string,
  anchor: AnchorPoint | null,
) {
  const before = doc();
  const conn = before.connections.find((k) => k.id === id);
  if (conn && (end === 'from' ? conn.to : conn.from) === cardId) {
    ui().pushToast("A string can't loop back to its own card.");
    return;
  }
  commitDoc((d) => ops.setConnectionEndpoint(d, id, end, cardId, anchor));
}

/**
 * Dragging a string onto empty canvas spawns a new note at the drop
 * point — already connected, already editing. One commit; if the note
 * is left empty its deletion cascades the string away again. A start
 * pin the user placed deliberately (Option-drag) is forwarded, never
 * discarded.
 */
export function connectToNewNote(
  fromId: string,
  pos: { x: number; y: number },
  fromAnchor: AnchorPoint | null = null,
) {
  const state = ui();
  const card = newTextCard({ x: pos.x - 120, y: pos.y - 20, z: ops.nextZ(doc()) });
  const ok = commitDoc((d) => {
    const withCard = ops.addCards(d, [card]);
    return ops.connect(withCard, fromId, card.id, { fromAnchor }).doc;
  });
  if (ok) {
    state.setSelection([card.id]);
    state.setEditingCard(card.id);
  }
}

// ---------- duplication / insertion ----------

export function duplicateSelection() {
  const ids = [...ui().selection];
  if (ids.length === 0) return;
  let newIds: string[] = [];
  commitDoc((d) => {
    const result = ops.duplicateCards(d, ids);
    newIds = result.newCardIds;
    return result.doc;
  });
  if (newIds.length > 0) ui().setSelection(newIds);
}

/** Drop/paste pipelines: insert fully-formed cards as one undo entry. */
export function insertCards(cards: Card[], select = true) {
  if (cards.length === 0) return;
  commitDoc((d) => ops.addCards(d, cards));
  if (select) ui().setSelection(cards.map((c) => c.id));
}

export function makeImageCard(
  pos: { x: number; y: number },
  asset: AssetRef,
  naturalW: number,
  naturalH: number,
) {
  return newImageCard({ x: pos.x, y: pos.y, z: ops.nextZ(doc()) }, asset, naturalW, naturalH);
}

export function makeFileCard(pos: { x: number; y: number }, asset: AssetRef) {
  return newFileCard({ x: pos.x, y: pos.y, z: ops.nextZ(doc()) }, asset);
}
