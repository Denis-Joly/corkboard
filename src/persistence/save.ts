/**
 * Debounced autosave. Every history commit schedules a save; blur,
 * board switch, and window close flush immediately. Viewport changes
 * ride a lazier debounce of their own (they never dirty the doc).
 */
import { useBoardStore, viewportRef } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import type { BoardDocument } from '../model/schema';
import { persistBoard } from './boardsRepo';

const SAVE_DEBOUNCE_MS = 800;
const VIEWPORT_DEBOUNCE_MS = 3000;

let timer: ReturnType<typeof setTimeout> | null = null;
let viewportTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let lastSavedViewportKey = '';
let lastWrittenJson: string | null = null;

/** Exact text of our most recent write — lets the file watcher tell
 *  our own save echoes apart from genuine external changes. */
export function getLastWrittenJson(): string | null {
  return lastWrittenJson;
}

export function scheduleSave(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
}

export function scheduleViewportSave(): void {
  if (viewportTimer) clearTimeout(viewportTimer);
  viewportTimer = setTimeout(() => {
    const key = viewportKey();
    if (key !== lastSavedViewportKey && !useUiStore.getState().dirty) {
      void flushSave({ force: true });
    }
  }, VIEWPORT_DEBOUNCE_MS);
}

function viewportKey(): string {
  const v = viewportRef.current;
  return `${Math.round(v.x)}:${Math.round(v.y)}:${v.zoom.toFixed(3)}`;
}

function withViewport(doc: BoardDocument): BoardDocument {
  return { ...doc, viewport: { ...viewportRef.current } };
}

/**
 * Persist now. Serializes concurrent calls; re-runs if the doc changed
 * while a save was in flight, so the last state always lands on disk.
 */
export async function flushSave(opts: { force?: boolean } = {}): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (inFlight) await inFlight.catch(() => {});

  const { doc, boardDir, readOnly } = useBoardStore.getState();
  const ui = useUiStore.getState();
  if (!boardDir || readOnly) return;
  if (!ui.dirty && !opts.force) return;

  inFlight = (async () => {
    try {
      lastWrittenJson = await persistBoard(boardDir, withViewport(doc));
      lastSavedViewportKey = viewportKey();
      // Only clean the dirty flag if nothing changed while saving.
      if (useBoardStore.getState().doc === doc) {
        useUiStore.getState().setDirty(false);
      } else {
        scheduleSave();
      }
    } catch (err) {
      console.error('save failed', err);
      useUiStore.getState().pushToast(`Couldn't save the board: ${String(err)}`);
    }
  })();
  await inFlight;
  inFlight = null;
}

/** Board switch: make sure the outgoing board is on disk. */
export async function flushBeforeBoardSwitch(): Promise<void> {
  if (viewportTimer) clearTimeout(viewportTimer);
  await flushSave();
}

export function noteViewportLoaded(): void {
  lastSavedViewportKey = viewportKey();
}
