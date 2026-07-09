/**
 * The document store. zundo's temporal middleware tracks ONLY `doc`
 * (via partialize), and only when the doc reference actually changed
 * (via equality) — boardDir/readOnly updates never pollute history.
 *
 * The live viewport is deliberately NOT written into `doc` during a
 * session (it lives in viewportRef and is merged at save time), so
 * pan/zoom can never become an undo step.
 */
import { temporal } from 'zundo';
import { create } from 'zustand';
import { newBoard } from '../model/factories';
import type { BoardDocument, Viewport } from '../model/schema';

export interface BoardState {
  doc: BoardDocument;
  /** Absolute path of the open board's folder; null until M3 wiring. */
  boardDir: string | null;
  /** True when the file came from a newer schema — saving is disabled. */
  readOnly: boolean;
}

export const useBoardStore = create<BoardState>()(
  temporal(
    (): BoardState => ({
      doc: newBoard('Untitled'),
      boardDir: null,
      readOnly: false,
    }),
    {
      partialize: (s) => ({ doc: s.doc }),
      equality: (past, current) => past.doc === current.doc,
      limit: 200,
    },
  ),
);

/** Live viewport (merged into the doc at save time; never in history). */
export const viewportRef: { current: Viewport } = {
  current: { x: 0, y: 0, zoom: 1 },
};

export function boardTemporal() {
  return useBoardStore.temporal.getState();
}
