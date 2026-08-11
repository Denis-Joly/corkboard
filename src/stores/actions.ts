/**
 * High-level user actions. Each is one semantic gesture → at most one
 * commitDoc() call → one undo step, one scheduled save.
 */
import {
  newFileCard,
  newId,
  newImageCard,
  newTextCard,
  DEFAULT_TEXT_HEIGHT,
} from '../model/factories';
import * as ops from '../model/ops';
import type {
  AnchorPoint,
  AssetRef,
  Card,
  FrameCard,
  TextAlign,
  TextCard,
} from '../model/schema';
import { isFrameCard } from '../model/schema';
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

export function commitTextEditor(
  card: TextCard,
  isDraft: boolean,
  text: string,
  measuredH: number,
  textAlign: TextAlign,
  alignmentTouched: boolean,
) {
  const state = ui();
  state.setEditingCard(null);
  if (isDraft) {
    state.setDraftCard(null);
    if (text.trim().length === 0) return;
    const finished: TextCard = {
      ...card,
      text,
      h: Math.max(measuredH, DEFAULT_TEXT_HEIGHT),
    };
    if (textAlign !== 'left') finished.textAlign = textAlign;
    if (commitDoc((d) => ops.addCards(d, [finished]))) {
      state.setSelection([finished.id]);
    }
    return;
  }
  if (text.trim().length === 0) {
    commitDoc((d) => ops.deleteCards(d, [card.id]));
    return;
  }
  commitDoc((d) =>
    ops.updateTextContent(d, card.id, {
      text,
      h: Math.max(measuredH, 24),
      textAlign: alignmentTouched ? (textAlign === 'left' ? null : textAlign) : undefined,
    }),
  );
}

export function commitFrameTitle(card: FrameCard, title: string) {
  ui().setEditingCard(null);
  const normalized = title.trim() || 'Frame';
  if (normalized !== card.title) {
    commitDoc((d) => ops.updateCard(d, card.id, { title: normalized }));
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

// ---------- grouping / selection routing ----------

/**
 * Group the selected cards under one fresh tag. Members of other
 * groups merge in — groups are flat, never nested. Re-grouping an
 * exact existing group is a no-op (no undo entry, no save).
 */
export function groupSelection() {
  const ids = [...ui().selection];
  if (ids.length < 2) return;
  const d = doc();
  const selected = d.cards.filter((c) => ids.includes(c.id));
  // Frames own their flat content group; merging frame groups would make
  // containment ambiguous. The exact existing framed group remains a no-op.
  const selectedFrames = selected.filter(isFrameCard);
  if (selectedFrames.length > 1) {
    ui().pushToast('Frames can’t be nested or merged.');
    return;
  }
  const tag0 = selected[0]?.group;
  if (
    tag0 !== undefined &&
    selected.every((c) => c.group === tag0) &&
    d.cards.every((c) => c.group !== tag0 || ids.includes(c.id))
  ) {
    return; // the selection already IS this exact group
  }
  const tag = newId();
  commitDoc((dd) => ops.setGroup(dd, ids, tag));
}

export function ungroupSelection() {
  const ids = [...ui().selection];
  if (ids.length > 0) commitDoc((d) => ops.setGroup(d, ids, null));
}

/** Wrap the selected ordinary cards in one movable, resizable frame. */
export function frameSelection() {
  const ids = [...ui().selection];
  let frame: FrameCard | undefined;
  const changed = commitDoc((d) => {
    const result = ops.frameCards(d, ids);
    frame = result.frame;
    return result.doc;
  });
  if (changed && frame) ui().setSelection([...ids, frame.id]);
}

/** Remove selected frame boundaries while preserving and ungrouping contents. */
export function removeSelectedFrames() {
  const state = ui();
  const d = doc();
  const frames = d.cards.filter((c) => state.selection.has(c.id) && isFrameCard(c));
  if (frames.length === 0) return;
  const groups = new Set(frames.map((f) => f.group).filter((g): g is string => g !== undefined));
  const remaining = d.cards
    .filter((c) => !isFrameCard(c) && c.group !== undefined && groups.has(c.group))
    .map((c) => c.id);
  if (commitDoc((dd) => ops.removeFrames(dd, frames.map((f) => f.id)))) {
    state.setSelection(remaining);
  }
}

/**
 * The single route for React Flow node 'select' changes. Selecting any
 * member selects its whole group (rubber-band included). Deselects are
 * applied RAW: React Flow narrowing the selection to a clicked member
 * (plain click on one card of a selected group) and ⌘-click toggling
 * one member off are both deliberate single-card intents, and
 * expanding them would make groups unescapable.
 */
let recentlySelected = new Set<string>();
let recentlySelectedAt = 0;

export function applyNodeSelectionChanges(changes: { id: string; selected: boolean }[]) {
  if (changes.length === 0) return;
  const state = ui();
  const d = doc();
  const next = new Set(state.selection);
  for (const ch of changes) {
    if (ch.selected) {
      const group = ops.getCard(d, ch.id)?.group;
      if (group !== undefined) {
        for (const c of d.cards) if (c.group === group) next.add(c.id);
      } else {
        next.add(ch.id);
      }
    } else {
      next.delete(ch.id);
    }
  }
  recentlySelected = new Set(changes.filter((c) => c.selected).map((c) => c.id));
  recentlySelectedAt = Date.now();
  state.setSelection(next, state.edgeSelection);
}

/**
 * Was this card selected by the current click's own pointerdown? The
 * click that SELECTS a group must not immediately narrow it — only a
 * second click on an already-selected member does. One-shot, and it
 * expires: a selection made by an old gesture (rubber-band minutes ago)
 * must not swallow a fresh click's narrowing.
 */
export function consumeJustSelected(id: string): boolean {
  const fresh = Date.now() - recentlySelectedAt < 500;
  const had = fresh && recentlySelected.has(id);
  recentlySelected = new Set();
  return had;
}

/** Second click on a member of a fully selected group → just that card. */
export function narrowSelectionTo(cardId: string) {
  const state = ui();
  const card = ops.getCard(doc(), cardId);
  if (card?.group === undefined) return;
  const members = doc().cards.filter((c) => c.group === card.group);
  const sel = state.selection;
  if (sel.size === members.length && members.every((m) => sel.has(m.id))) {
    state.setSelection([cardId], state.edgeSelection);
  }
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

/** Recolor the selected strings; null returns them to the default red. */
export function applyEdgeColor(color: string | null) {
  const ids = [...ui().edgeSelection];
  if (ids.length > 0) commitDoc((d) => ops.setConnectionColor(d, ids, color));
}

/** Return every selected string's ends to floating attachment. */
export function unpinSelectedEdges() {
  const ids = [...ui().edgeSelection];
  if (ids.length > 0) commitDoc((d) => ops.unpinConnections(d, ids));
}

// ---------- connections ----------

export function connectCards(
  from: string,
  to: string,
  opts: ops.ConnectOptions = {},
): Pick<ops.ConnectResult, 'duplicateOf' | 'frameAtCapacity' | 'frameMemberBoundary'> {
  let duplicateOf: string | undefined;
  let frameAtCapacity: string | undefined;
  let frameMemberBoundary: string | undefined;
  commitDoc((d) => {
    const result = ops.connect(d, from, to, opts);
    duplicateOf = result.duplicateOf;
    frameAtCapacity = result.frameAtCapacity;
    frameMemberBoundary = result.frameMemberBoundary;
    return result.doc;
  });
  return { duplicateOf, frameAtCapacity, frameMemberBoundary };
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
  if (conn && conn[end] !== cardId) {
    if (ops.frameMemberPair(before, end === 'from' ? conn.to : conn.from, cardId)) {
      ui().pushToast('Connect the frame to something outside it.');
      return;
    }
    if (ops.frameConnectionAtCapacity(before, cardId, id)) {
      ui().pushToast('That frame already has its one boundary link.');
      return;
    }
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
  let rejectedFrame: string | undefined;
  const ok = commitDoc((d) => {
    const withCard = ops.addCards(d, [card]);
    const result = ops.connect(withCard, fromId, card.id, { fromAnchor });
    rejectedFrame = result.frameAtCapacity;
    return result.created ? result.doc : d;
  });
  if (ok) {
    state.setSelection([card.id]);
    state.setEditingCard(card.id);
  } else if (rejectedFrame) {
    state.pushToast('That frame already has its one boundary link.');
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
