/**
 * App startup and board opening. First launch bootstraps
 * ~/CorkBoards/My First Board/ — never a dead-end picker.
 */
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import { rfRef } from '../canvas/rfInstance';
import { installFileDrop } from '../interactions/fileDrop';
import { loadDocument, setSaveScheduler } from '../stores/history';
import { useBoardStore, viewportRef } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import {
  createBoard,
  deleteBoard,
  discoverBoards,
  loadBoard,
  renameBoard,
  type LoadedBoard,
} from './boardsRepo';
import { loadConfig, saveConfig } from './config';
import { setReloadHandler, startWatching, stopWatching } from './externalChanges';
import { flushBeforeBoardSwitch, flushSave, noteViewportLoaded, scheduleSave } from './save';

let started = false;

export async function bootstrapApp(): Promise<void> {
  if (started) return; // StrictMode double-invoke guard
  started = true;

  setSaveScheduler(scheduleSave);
  setReloadHandler(reloadFromDisk);
  installCloseFlush();
  window.addEventListener('blur', () => void flushSave());
  void installFileDrop().catch((err) => console.warn('drag-drop unavailable', err));

  const toast = (msg: string) => useUiStore.getState().pushToast(msg);
  try {
    const [config, boards] = await Promise.all([loadConfig(), discoverBoards()]);
    const remembered = boards.find((b) => b.doc.id === config.lastOpenedBoardId);
    const target = remembered ?? boards[0];
    if (target) {
      await openBoardDir(target.dir);
    } else {
      const created = await createBoard('My First Board');
      applyLoadedBoard(created);
      await startWatching(created.dir);
    }
  } catch (err) {
    console.error('bootstrap failed', err);
    toast(`Couldn't open your boards: ${String(err)}`);
  }
}

/** Switch to (or initially open) the board folder at `dir`. */
export async function openBoardDir(dir: string): Promise<void> {
  await flushBeforeBoardSwitch();
  await stopWatching();
  const loaded = await loadBoard(dir);
  applyLoadedBoard(loaded);
  await startWatching(dir);
}

/**
 * Watcher-triggered reload: no flush (disk wins), keep the watcher.
 * Returns false WITHOUT applying when a local edit landed while the
 * disk file was being read — the caller must take the conflict path
 * instead, so that edit is never silently discarded.
 */
async function reloadFromDisk(dir: string): Promise<boolean> {
  const loaded = await loadBoard(dir);
  const { boardDir } = useBoardStore.getState();
  if (boardDir !== dir || useUiStore.getState().dirty) return false;
  applyLoadedBoard(loaded);
  return true;
}

/**
 * Rename a board folder safely. When it's the OPEN board, pending edits
 * are flushed and the watcher stopped BEFORE the folder moves —
 * otherwise the queued save would target the old path, fail, and the
 * reload would silently discard those edits.
 */
export async function renameBoardDir(dir: string, newName: string): Promise<string> {
  const isOpen = useBoardStore.getState().boardDir === dir;
  if (isOpen) {
    const saved = await flushBeforeBoardSwitch();
    if (!saved) throw new Error('the board could not be saved — rename aborted');
    await stopWatching();
  }
  const newDir = await renameBoard(dir, newName);
  if (isOpen) await openBoardDir(newDir);
  return newDir;
}

/** Create a new board and open it. */
export async function createAndOpenBoard(name: string): Promise<void> {
  await flushBeforeBoardSwitch();
  await stopWatching();
  const created = await createBoard(name);
  applyLoadedBoard(created);
  await startWatching(created.dir);
}

/** Move a board folder to the Trash; if it was open, fall back. */
export async function deleteBoardDir(dir: string): Promise<void> {
  const wasOpen = useBoardStore.getState().boardDir === dir;
  if (wasOpen) await stopWatching();
  await deleteBoard(dir);
  if (wasOpen) {
    const remaining = await discoverBoards();
    if (remaining.length > 0) {
      await openBoardDir(remaining[0].dir);
    } else {
      const created = await createBoard('My First Board');
      applyLoadedBoard(created);
      await startWatching(created.dir);
    }
  }
}

function applyLoadedBoard(loaded: LoadedBoard): void {
  const toast = (msg: string) => useUiStore.getState().pushToast(msg);

  loadDocument(loaded.doc, loaded.dir, loaded.readOnly);
  viewportRef.current = { ...loaded.doc.viewport };
  rfRef.current?.setViewport(loaded.doc.viewport);
  noteViewportLoaded();

  void saveConfig({ lastOpenedBoardId: loaded.doc.id });

  if (loaded.recoveredFromBackup) {
    toast('board.json was unreadable — recovered from the automatic backup.');
  }
  if (loaded.repairs.length > 0) {
    console.warn('board repairs:', loaded.repairs);
    toast(`Repaired ${loaded.repairs.length} issue${loaded.repairs.length > 1 ? 's' : ''} while loading.`);
  }
  if (loaded.readOnly) {
    toast('This board was made by a newer version of Corkboard — opened read-only.');
  }
}

/** Flush pending work before the window closes; never lose an edit.
 *  If the final save FAILS, the user decides — no silent loss. */
function installCloseFlush(): void {
  let closing = false;
  void getCurrentWindow().onCloseRequested(async (event) => {
    if (closing) return;
    if (!useUiStore.getState().dirty) return;
    event.preventDefault();
    closing = true;
    try {
      const saved = await flushSave();
      if (saved) {
        void getCurrentWindow().destroy();
        return;
      }
      const quitAnyway = await ask(
        'Your latest changes could not be saved. Quit anyway and lose them?',
        { title: 'Save failed', kind: 'warning' },
      );
      if (quitAnyway) {
        void getCurrentWindow().destroy();
      } else {
        closing = false;
      }
    } catch {
      // If even the dialog fails, stay open rather than lose data.
      closing = false;
    }
  });
}
