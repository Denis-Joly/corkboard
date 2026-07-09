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
    </header>
  );
}
