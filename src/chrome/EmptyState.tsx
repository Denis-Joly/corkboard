import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';

/** Three lines that ARE the tutorial; gone once the board has content. */
export function EmptyState() {
  const cardCount = useBoardStore((s) => s.doc.cards.length);
  const hasDraft = useUiStore((s) => s.draftCard !== null);
  if (cardCount > 0 || hasDraft) return null;

  return (
    <div className="empty-state">
      <p>
        <strong>Double-click</strong> anywhere to write
      </p>
      <p>
        <strong>Drop files</strong> from Finder to pin them
      </p>
      <p>
        <strong>⌘V</strong> to paste text or images
      </p>
    </div>
  );
}
