import { useViewport } from '@xyflow/react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CARD_COLORS, TEXT_STYLES, isTextCard } from '../model/schema';
import {
  applyColor,
  applyTextStyle,
  bringSelectionToFront,
  deleteSelection,
} from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { rfRef } from '../canvas/rfInstance';

/**
 * Floats above the selection bounds; tracks pan/zoom via useViewport
 * (must render inside the ReactFlowProvider). Hidden during drags,
 * resizes, and text editing.
 */
export function SelectionToolbar() {
  useViewport(); // re-render on pan/zoom
  const doc = useBoardStore((s) => s.doc);
  const { selection, busy } = useUiStore(
    useShallow((s) => ({
      selection: s.selection,
      busy: s.transient.size > 0 || s.editingCardId !== null || s.draftCard !== null,
    })),
  );

  const cards = useMemo(
    () => doc.cards.filter((c) => selection.has(c.id)),
    [doc, selection],
  );

  if (busy || cards.length === 0 || !rfRef.current) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.w);
  }
  const top = rfRef.current.flowToScreenPosition({ x: (minX + maxX) / 2, y: minY });
  const anyText = cards.some(isTextCard);
  const currentStyle = anyText
    ? (cards.find(isTextCard) as { style?: string } | undefined)?.style
    : undefined;

  return (
    <div
      className="selection-toolbar nodrag nopan"
      style={{ left: top.x, top: Math.max(top.y - 48, 52) }}
    >
      {CARD_COLORS.map((color, i) => (
        <button
          key={color}
          type="button"
          className={`swatch swatch-${color}`}
          title={`${color} (${i + 1})`}
          onClick={() => applyColor(color)}
        />
      ))}
      {anyText && (
        <>
          <span className="toolbar-divider" />
          {TEXT_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              className={`style-btn ${currentStyle === style ? 'is-active' : ''}`}
              title={style}
              onClick={() => applyTextStyle(style)}
            >
              {style === 'note' ? 'N' : style === 'sticky' ? 'S' : 'H'}
            </button>
          ))}
        </>
      )}
      <span className="toolbar-divider" />
      <button type="button" title="Bring to front" onClick={() => bringSelectionToFront()}>
        ↑
      </button>
      <button type="button" title="Delete (⌫)" onClick={() => deleteSelection()}>
        🗑
      </button>
    </div>
  );
}
