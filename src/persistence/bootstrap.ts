/**
 * App startup and board opening. First launch bootstraps
 * ~/CorkBoards/My First Board/ — never a dead-end picker.
 */
import { getCurrentWindow } from '@tauri-apps/api/window';
import { rfRef } from '../canvas/rfInstance';
import { installFileDrop } from '../interactions/fileDrop';
import { loadDocument, setSaveScheduler } from '../stores/history';
import { viewportRef } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { createBoard, discoverBoards, loadBoard, type LoadedBoard } from './boardsRepo';
import { loadConfig, saveConfig } from './config';
import { flushBeforeBoardSwitch, flushSave, noteViewportLoaded, scheduleSave } from './save';

let started = false;

export async function bootstrapApp(): Promise<void> {
  if (started) return; // StrictMode double-invoke guard
  started = true;

  setSaveScheduler(scheduleSave);
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
    }
  } catch (err) {
    console.error('bootstrap failed', err);
    toast(`Couldn't open your boards: ${String(err)}`);
  }
}

/** Switch to (or initially open) the board folder at `dir`. */
export async function openBoardDir(dir: string): Promise<void> {
  await flushBeforeBoardSwitch();
  const loaded = await loadBoard(dir);
  applyLoadedBoard(loaded);
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

/** Flush pending work before the window closes; never lose an edit. */
function installCloseFlush(): void {
  let closing = false;
  void getCurrentWindow().onCloseRequested(async (event) => {
    if (closing) return;
    if (useUiStore.getState().dirty) {
      event.preventDefault();
      closing = true;
      try {
        await flushSave();
      } finally {
        void getCurrentWindow().destroy();
      }
    }
  });
}
