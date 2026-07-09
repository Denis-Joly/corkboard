import { useUiStore } from '../stores/uiStore';

/**
 * WebKit gives no native feedback for Tauri-intercepted drags, so we
 * fake it well: dim the board and float a dashed ring + count badge
 * at the cursor.
 */
export function DropOverlay() {
  const preview = useUiStore((s) => s.dropPreview);
  if (!preview) return null;

  return (
    <div className="drop-overlay">
      <div className="drop-ring" style={{ left: preview.x, top: preview.y }}>
        {preview.count > 0 && (
          <span className="drop-badge">
            {preview.count === 1 ? 'Drop 1 file' : `Drop ${preview.count} files`}
          </span>
        )}
      </div>
    </div>
  );
}
