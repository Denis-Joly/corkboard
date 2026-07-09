/**
 * The single chokepoint for document changes. Every semantic gesture
 * ends in exactly one commitDoc() call → one undo step AND one
 * scheduled save, by construction.
 *
 * Interactions stream transient geometry into uiStore (never the doc),
 * so zundo needs no pause/resume gymnastics: the doc simply doesn't
 * change until a gesture completes.
 */
import type { BoardDocument } from '../model/schema';
import { boardTemporal, useBoardStore } from './boardStore';
import { useUiStore } from './uiStore';

/** Wired by the persistence layer (M3); no-op until then. */
let scheduleSave: () => void = () => {};
export function setSaveScheduler(fn: () => void) {
  scheduleSave = fn;
}

/**
 * Apply a pure transformation to the document. Returns true when the
 * doc actually changed (and history + autosave were touched).
 */
export function commitDoc(
  produce: (doc: BoardDocument) => BoardDocument,
): boolean {
  const { doc, readOnly } = useBoardStore.getState();
  if (readOnly) {
    useUiStore.getState().pushToast('This board was made by a newer version — read-only.');
    return false;
  }
  const next = produce(doc);
  if (next === doc) return false;
  useBoardStore.setState({ doc: next });
  useUiStore.getState().setDirty(true);
  scheduleSave();
  return true;
}

export function undo() {
  if (boardTemporal().pastStates.length === 0) return;
  boardTemporal().undo();
  afterTimeTravel();
}

export function redo() {
  if (boardTemporal().futureStates.length === 0) return;
  boardTemporal().redo();
  afterTimeTravel();
}

function afterTimeTravel() {
  const ui = useUiStore.getState();
  ui.setDirty(true);
  scheduleSave();
  // Selection may reference cards that no longer exist; the adapter
  // ignores unknown ids, but editing state must not point at ghosts.
  const doc = useBoardStore.getState().doc;
  if (ui.editingCardId && !doc.cards.some((c) => c.id === ui.editingCardId)) {
    ui.setEditingCard(null);
  }
  if (ui.editingEdgeId && !doc.connections.some((k) => k.id === ui.editingEdgeId)) {
    ui.setEditingEdge(null);
  }
}

/** Board switch: new doc, fresh history, clean ephemeral state. */
export function loadDocument(doc: BoardDocument, boardDir: string | null, readOnly: boolean) {
  useBoardStore.setState({ doc, boardDir, readOnly });
  boardTemporal().clear();
  useUiStore.getState().resetForBoard();
}
