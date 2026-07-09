/**
 * Sync safety. Watches the open board's board.json for external changes
 * (iCloud/Dropbox peers, hand edits):
 *   - our own save echoes are recognized by content and ignored
 *   - disk changed + local clean → reload silently
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
/** Callback into bootstrap (avoids an import cycle). */
let reloadBoard: (dir: string) => Promise<void> = async () => {};

export function setReloadHandler(fn: (dir: string) => Promise<void>) {
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

  const ui = useUiStore.getState();
  if (!ui.dirty) {
    await reloadBoard(dir);
    ui.pushToast('Board updated from disk.');
    return;
  }

  // Both sides changed: preserve OUR version alongside, take the disk's.
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const conflictPath = `${dir}/board.conflict.${stamp}.json`;
    const { doc } = useBoardStore.getState();
    await writeTextFile(conflictPath, JSON.stringify(doc, null, 2));
    ui.setDirty(false); // our state is preserved in the conflict copy
    await reloadBoard(dir);
    useUiStore.getState().setConflict({ path: conflictPath });
  } catch (err) {
    console.error('conflict handling failed', err);
    ui.pushToast(`Sync conflict — couldn't write a conflict copy: ${String(err)}`);
  }
}

/** "Keep mine": restore the conflict copy as the live document. */
export async function keepMine(conflictPath: string): Promise<void> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const text = await readTextFile(conflictPath);
  const { parseBoardDocument } = await import('../model/validate');
  const { loadDocument } = await import('../stores/history');
  const { boardDir, readOnly } = useBoardStore.getState();
  if (!boardDir) return;
  const { doc } = parseBoardDocument(JSON.parse(text), 'restored');
  loadDocument(doc, boardDir, readOnly);
  useUiStore.getState().setConflict(null);
  useUiStore.getState().setDirty(true);
  await flushSave();
}
