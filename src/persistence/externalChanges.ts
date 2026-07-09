/**
 * Sync safety. Watches the open board's board.json for external changes
 * (iCloud/Dropbox peers, hand edits):
 *   - our own save echoes are recognized by content and ignored
 *   - disk changed + local clean → reload silently (re-checked after the
 *     read; an edit landing mid-reload flips to the conflict path)
 *   - disk changed + local dirty → write board.conflict.<ts>.json with
 *     OUR state, load the disk version, offer "Keep mine".
 * Never silently clobber a sync peer; never lose local work.
 */
import { watch, type UnwatchFn } from '@tauri-apps/plugin-fs';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { getLastWrittenJson, flushSave } from './save';

let unwatch: UnwatchFn | null = null;
let watchedDir: string | null = null;
/** Callback into bootstrap (avoids an import cycle). Returns false when
 *  the reload was declined because local edits appeared mid-read. */
let reloadBoard: (dir: string) => Promise<boolean> = async () => false;

export function setReloadHandler(fn: (dir: string) => Promise<boolean>) {
  reloadBoard = fn;
}

export async function startWatching(dir: string): Promise<void> {
  await stopWatching();
  watchedDir = dir;
  try {
    unwatch = await watch(`${dir}/board.json`, () => void onDiskChange(dir), {
      delayMs: 400,
    });
  } catch (err) {
    console.warn('board watcher unavailable', err);
  }
}

export async function stopWatching(): Promise<void> {
  if (unwatch) {
    try {
      unwatch();
    } catch {
      // watcher already gone
    }
    unwatch = null;
  }
  watchedDir = null;
}

async function onDiskChange(dir: string): Promise<void> {
  const { boardDir } = useBoardStore.getState();
  if (dir !== boardDir || dir !== watchedDir) return;

  let diskText: string;
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    diskText = await readTextFile(`${dir}/board.json`);
  } catch {
    return; // transient (mid-rename); the next event will catch up
  }

  if (diskText === getLastWrittenJson()) return; // our own save echo

  if (!useUiStore.getState().dirty) {
    if (await reloadBoard(dir)) {
      useUiStore.getState().pushToast('Board updated from disk.');
      return;
    }
    // A local edit landed while reading — fall through to conflict.
  }
  await preserveMineAndTakeDisk(dir);
}

/** Both sides changed: preserve OUR version alongside, take the disk's. */
async function preserveMineAndTakeDisk(dir: string): Promise<void> {
  const ui = useUiStore.getState();
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const conflictPath = `${dir}/board.conflict.${stamp}.json`;
    const { doc } = useBoardStore.getState();
    await writeTextFile(conflictPath, JSON.stringify(doc, null, 2));
    ui.setDirty(false); // our state is preserved in the conflict copy
    if (!(await reloadBoard(dir))) {
      // Yet another edit landed — keep OUR doc live; the copy is spare.
      useUiStore.getState().setDirty(true);
      return;
    }
    useUiStore.getState().setConflict({ path: conflictPath });
  } catch (err) {
    console.error('conflict handling failed', err);
    ui.pushToast(`Sync conflict — couldn't write a conflict copy: ${String(err)}`);
  }
}

/** "Keep mine": restore the conflict copy as the live document. */
export async function keepMine(conflictPath: string): Promise<void> {
  const { boardDir, readOnly } = useBoardStore.getState();
  // The banner could in principle outlive a board switch — never apply
  // one board's conflict copy to another board.
  if (!boardDir || !conflictPath.startsWith(`${boardDir}/`)) {
    useUiStore.getState().setConflict(null);
    useUiStore.getState().pushToast('That conflict copy belongs to a different board.');
    return;
  }
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const text = await readTextFile(conflictPath);
  const { parseBoardDocument } = await import('../model/validate');
  const { loadDocument } = await import('../stores/history');
  const { doc } = parseBoardDocument(JSON.parse(text), 'restored');
  loadDocument(doc, boardDir, readOnly);
  useUiStore.getState().setConflict(null);
  useUiStore.getState().setDirty(true);
  await flushSave();
}
