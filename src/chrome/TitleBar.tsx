import { confirm } from '@tauri-apps/plugin-dialog';
import { referencedAssetPaths } from '../model/ops';
import { cleanBoard } from '../tauri/commands';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';

/**
 * Overlay-titlebar drag strip. The traffic lights float over the left
 * edge (titleBarStyle: Overlay + hiddenTitle), so content starts after
 * an inset. The board-name pill opens the switcher.
 */
export function TitleBar() {
  const name = useBoardStore((s) => s.doc.name);
  const readOnly = useBoardStore((s) => s.readOnly);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <button
        type="button"
        className="board-pill"
        title="Switch board (⌘O)"
        onClick={() => useUiStore.getState().setSwitcherOpen(true)}
      >
        {name}
        {readOnly && <span className="read-only-tag">read-only</span>}
      </button>
      <div className="titlebar-actions">
        <button
          type="button"
          className="titlebar-btn"
          title="Shortcuts (?)"
          onClick={() => useUiStore.getState().setHelpOpen(true)}
        >
          ?
        </button>
        <button
          type="button"
          className="titlebar-btn"
          title="Clean up board — move unused files in assets/ to the Trash"
          onClick={() => void cleanUp()}
        >
          ⌦
        </button>
      </div>
    </header>
  );
}

async function cleanUp(): Promise<void> {
  const { doc, boardDir } = useBoardStore.getState();
  const toast = (m: string) => useUiStore.getState().pushToast(m);
  if (!boardDir) return;
  const ok = await confirm(
    'Move files in assets/ that no card references to the Trash?',
    { title: 'Clean up board' },
  );
  if (!ok) return;
  try {
    const removed = await cleanBoard(boardDir, referencedAssetPaths(doc));
    toast(
      removed.length === 0
        ? 'Nothing to clean — every file is in use.'
        : `Moved ${removed.length} unused file${removed.length > 1 ? 's' : ''} to the Trash.`,
    );
  } catch (err) {
    toast(`Cleanup failed: ${String(err)}`);
  }
}
