/**
 * Ephemeral view state: selection, editing, transient drag/resize
 * positions, drop previews, toasts. Lives in its OWN store so undo
 * history (which wraps only boardStore.doc) can never be polluted
 * by selection churn — structurally, not by configuration.
 */
import { create } from 'zustand';
import type { TextCard } from '../model/schema';

export interface TransientBox {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface Toast {
  id: number;
  message: string;
}

export interface DropPreview {
  x: number;
  y: number;
  count: number;
}

interface UiState {
  selection: ReadonlySet<string>;
  edgeSelection: ReadonlySet<string>;
  /** Existing card currently being edited inline. */
  editingCardId: string | null;
  /** Connection whose label is being edited. */
  editingEdgeId: string | null;
  /**
   * A text card being created that is NOT yet in the document — it only
   * enters the doc (one undo entry) when committed with content.
   */
  draftCard: TextCard | null;
  /** Live drag/resize geometry, merged over doc cards by the adapter. */
  transient: ReadonlyMap<string, TransientBox>;
  /**
   * DOM-measured node sizes, echoed back onto the nodes we hand React
   * Flow. Required in controlled mode: without `measured` on the user
   * node, RF resets its internals (handle bounds!) on every rebuild.
   */
  measured: ReadonlyMap<string, { width: number; height: number }>;
  dropPreview: DropPreview | null;
  /** Asset imports in flight, shown as skeleton cards. */
  pendingImports: ReadonlyMap<string, { x: number; y: number; name: string }>;
  toasts: Toast[];
  dirty: boolean;
  switcherOpen: boolean;
  helpOpen: boolean;
  /** Right-click menu on a card. */
  contextMenu: { x: number; y: number; cardId: string } | null;
  /** A sync conflict copy exists; banner offers "Keep mine". */
  conflict: { path: string } | null;

  setSelection: (cards: Iterable<string>, edges?: Iterable<string>) => void;
  applySelectionChange: (id: string, selected: boolean, kind: 'node' | 'edge') => void;
  clearSelection: () => void;
  setEditingCard: (id: string | null) => void;
  setEditingEdge: (id: string | null) => void;
  setDraftCard: (card: TextCard | null) => void;
  setTransient: (id: string, box: TransientBox) => void;
  clearTransient: (ids?: string[]) => void;
  setMeasured: (id: string, dims: { width: number; height: number }) => void;
  setDropPreview: (preview: DropPreview | null) => void;
  addPendingImport: (key: string, at: { x: number; y: number; name: string }) => void;
  removePendingImport: (key: string) => void;
  setDirty: (dirty: boolean) => void;
  setSwitcherOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setContextMenu: (menu: { x: number; y: number; cardId: string } | null) => void;
  setConflict: (conflict: { path: string } | null) => void;
  pushToast: (message: string, ttlMs?: number) => void;
  dismissToast: (id: number) => void;
  /** Reset everything ephemeral (board switch). */
  resetForBoard: () => void;
}

let toastSeq = 1;

export const useUiStore = create<UiState>()((set, get) => ({
  selection: new Set<string>(),
  edgeSelection: new Set<string>(),
  editingCardId: null,
  editingEdgeId: null,
  draftCard: null,
  transient: new Map(),
  measured: new Map(),
  dropPreview: null,
  pendingImports: new Map(),
  toasts: [],
  dirty: false,
  switcherOpen: false,
  helpOpen: false,
  contextMenu: null,
  conflict: null,

  setSelection: (cards, edges = []) =>
    set({ selection: new Set(cards), edgeSelection: new Set(edges) }),

  applySelectionChange: (id, selected, kind) =>
    set((s) => {
      const key = kind === 'node' ? 'selection' : 'edgeSelection';
      const current = kind === 'node' ? s.selection : s.edgeSelection;
      if (current.has(id) === selected) return {};
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return { [key]: next };
    }),

  clearSelection: () => set({ selection: new Set(), edgeSelection: new Set() }),

  setEditingCard: (id) => set({ editingCardId: id }),
  setEditingEdge: (id) => set({ editingEdgeId: id }),
  setDraftCard: (card) => set({ draftCard: card }),

  setTransient: (id, box) =>
    set((s) => {
      const next = new Map(s.transient);
      next.set(id, { ...next.get(id), ...box });
      return { transient: next };
    }),

  clearTransient: (ids) =>
    set((s) => {
      if (s.transient.size === 0) return {};
      if (!ids) return { transient: new Map() };
      const next = new Map(s.transient);
      for (const id of ids) next.delete(id);
      return { transient: next };
    }),

  setMeasured: (id, dims) =>
    set((s) => {
      const prev = s.measured.get(id);
      if (prev && prev.width === dims.width && prev.height === dims.height) return {};
      const next = new Map(s.measured);
      next.set(id, dims);
      return { measured: next };
    }),

  setDropPreview: (dropPreview) => set({ dropPreview }),

  addPendingImport: (key, at) =>
    set((s) => {
      const next = new Map(s.pendingImports);
      next.set(key, at);
      return { pendingImports: next };
    }),

  removePendingImport: (key) =>
    set((s) => {
      if (!s.pendingImports.has(key)) return {};
      const next = new Map(s.pendingImports);
      next.delete(key);
      return { pendingImports: next };
    }),

  setDirty: (dirty) => set({ dirty }),
  setSwitcherOpen: (switcherOpen) => set({ switcherOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setConflict: (conflict) => set({ conflict }),

  pushToast: (message, ttlMs = 4200) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => get().dismissToast(id), ttlMs);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  resetForBoard: () =>
    set({
      selection: new Set(),
      edgeSelection: new Set(),
      editingCardId: null,
      editingEdgeId: null,
      draftCard: null,
      transient: new Map(),
      measured: new Map(),
      dropPreview: null,
      pendingImports: new Map(),
      dirty: false,
      // Board-scoped chrome must never leak across a switch — a stale
      // "Keep mine" banner could overwrite the wrong board.
      conflict: null,
      contextMenu: null,
    }),
}));

/**
 * Last pointer position in flow coordinates — written on every pointer
 * move, so it lives in a plain ref (never reactive state). `moved`
 * stays false until the pointer first enters the canvas, so callers
 * can fall back to the viewport center instead of flow (0,0).
 */
export const pointerFlowRef = { current: { x: 0, y: 0 }, moved: false };
