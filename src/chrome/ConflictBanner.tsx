import { keepMine } from '../persistence/externalChanges';
import { useUiStore } from '../stores/uiStore';

/**
 * Shown after a sync conflict: the disk version is now live, and the
 * user's own edits sit in a conflict copy next to board.json.
 */
export function ConflictBanner() {
  const conflict = useUiStore((s) => s.conflict);
  if (!conflict) return null;

  return (
    <div className="conflict-banner">
      <span>
        This board changed on disk while you were editing. Your version was saved as a conflict
        copy.
      </span>
      <button
        type="button"
        onClick={() =>
          void keepMine(conflict.path).catch((err) =>
            useUiStore.getState().pushToast(`Couldn't restore: ${String(err)}`),
          )
        }
      >
        Keep mine
      </button>
      <button type="button" onClick={() => useUiStore.getState().setConflict(null)}>
        Keep disk version
      </button>
    </div>
  );
}
