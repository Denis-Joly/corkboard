/**
 * Debounced autosave. Every history commit schedules a save; blur,
 * board switch, and window close flush immediately. Viewport changes
 * ride a lazier debounce of their own (they never dirty the doc).
 *
 * All saves are serialized through a single promise chain — two
 * flushes can never run persistBoard concurrently on the same file.
 */
import { useBoardStore, viewportRef } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import type { BoardDocument } from '../model/schema';
import { persistBoard } from './boardsRepo';

const SAVE_DEBOUNCE_MS = 800;
const VIEWPORT_DEBOUNCE_MS = 3000;

let timer: ReturnType<typeof setTimeout> | null = null;
let viewportTimer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<boolean> = Promise.resolve(true);
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
 * Persist now. Returns true when the board is safely on disk (or there
 * was nothing to write), false when the save FAILED — callers deciding
 * whether it's safe to close/switch must check it.
 */
export function flushSave(opts: { force?: boolean } = {}): Promise<boolean> {
  const run = chain.then(
    () => doFlush(opts),
    () => doFlush(opts),
  );
  chain = run;
  return run;
}

async function doFlush(opts: { force?: boolean }): Promise<boolean> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const { doc, boardDir, readOnly } = useBoardStore.getState();
  const ui = useUiStore.getState();
  if (!boardDir || readOnly) return true;
  if (!ui.dirty && !opts.force) return true;

  try {
    lastWrittenJson = await persistBoard(boardDir, withViewport(doc));
    lastSavedViewportKey = viewportKey();
    // Only clean the dirty flag if nothing changed while saving.
    if (useBoardStore.getState().doc === doc) {
      useUiStore.getState().setDirty(false);
    } else {
      scheduleSave();
    }
    return true;
  } catch (err) {
    console.error('save failed', err);
    useUiStore.getState().pushToast(`Couldn't save the board: ${String(err)}`);
    return false;
  }
}

/** Board switch: make sure the outgoing board is on disk. */
export async function flushBeforeBoardSwitch(): Promise<boolean> {
  if (viewportTimer) clearTimeout(viewportTimer);
  return flushSave();
}

export function noteViewportLoaded(): void {
  lastSavedViewportKey = viewportKey();
}
