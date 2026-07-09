import { useViewport } from '@xyflow/react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CARD_COLORS, STRING_COLORS, TEXT_STYLES, isTextCard } from '../model/schema';
import {
  applyColor,
  applyEdgeColor,
  applyTextStyle,
  bringSelectionToFront,
  deleteSelection,
  groupSelection,
  ungroupSelection,
  unpinSelectedEdges,
} from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { rfRef } from '../canvas/rfInstance';
import { stringPath, type Rect } from '../canvas/edges/floating';

/**
 * Floats above the selection bounds; tracks pan/zoom via useViewport
 * (must render inside the ReactFlowProvider). Hidden during drags,
 * resizes, and text editing. Cards win a mixed selection; a pure
 * string selection gets the string toolbar (colors, unpin, delete).
 */
export function SelectionToolbar() {
  useViewport(); // re-render on pan/zoom
  const doc = useBoardStore((s) => s.doc);
  const { selection, edgeSelection, busy } = useUiStore(
    useShallow((s) => ({
      selection: s.selection,
      edgeSelection: s.edgeSelection,
      busy: s.transient.size > 0 || s.editingCardId !== null || s.draftCard !== null,
    })),
  );

  const cards = useMemo(
    () => doc.cards.filter((c) => selection.has(c.id)),
    [doc, selection],
  );

  if (busy || !rfRef.current) return null;
  if (cards.length === 0) {
    const edges = doc.connections.filter((k) => edgeSelection.has(k.id));
    if (edges.length === 0) return null;
    return <EdgeToolbar edges={edges} />;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }
  const top = rfRef.current.flowToScreenPosition({ x: (minX + maxX) / 2, y: minY });
  // Float well above the selection so the connection pin (which sits
  // just above the card) stays clickable; flip below when out of room.
  const TOOLBAR_GAP = 72;
  const TITLEBAR_CLEARANCE = 56;
  let toolbarTop = top.y - TOOLBAR_GAP;
  if (toolbarTop < TITLEBAR_CLEARANCE) {
    const bottom = rfRef.current.flowToScreenPosition({ x: (minX + maxX) / 2, y: maxY });
    toolbarTop = bottom.y + 20;
  }
  const anyText = cards.some(isTextCard);
  const currentStyle = anyText
    ? (cards.find(isTextCard) as { style?: string } | undefined)?.style
    : undefined;

  return (
    <div className="selection-toolbar nodrag nopan" style={{ left: top.x, top: toolbarTop }}>
      {CARD_COLORS.map((color, i) => (
        <button
          key={color}
          type="button"
          className="swatch"
          // Inline so no button-reset rule can blank the color out.
          style={{ background: `var(--card-${color})` }}
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
              title={
                style === 'note'
                  ? 'Note — plain bordered card'
                  : style === 'sticky'
                    ? 'Sticky — saturated color, larger text'
                    : 'Heading — big borderless title (colors don’t apply)'
              }
              onClick={() => applyTextStyle(style)}
            >
              {style === 'note' ? 'N' : style === 'sticky' ? 'S' : 'H'}
            </button>
          ))}
        </>
      )}
      {cards.length >= 2 && (
        <>
          <span className="toolbar-divider" />
          {cards.every((c) => c.group !== undefined && c.group === cards[0].group) ? (
            <button
              type="button"
              title="Ungroup (⇧⌘G)"
              onClick={() => ungroupSelection()}
            >
              ⧉
            </button>
          ) : (
            <button
              type="button"
              title="Group — select and move as one (⌘G)"
              onClick={() => groupSelection()}
            >
              ⧈
            </button>
          )}
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

function EdgeToolbar({
  edges,
}: {
  edges: import('../model/schema').Connection[];
}) {
  const doc = useBoardStore.getState().doc;
  const rf = rfRef.current!;

  // Position above the bounding box of the selected strings' midpoints.
  const rects = new Map<string, Rect>(doc.cards.map((c) => [c.id, c]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  const anyPinned = edges.some((k) => k.fromAnchor != null || k.toAnchor != null);
  for (const k of edges) {
    const a = rects.get(k.from);
    const b = rects.get(k.to);
    if (!a || !b) continue;
    const { mid } = stringPath(a, b, k.fromAnchor, k.toAnchor);
    minX = Math.min(minX, mid.x);
    minY = Math.min(minY, mid.y);
    maxX = Math.max(maxX, mid.x);
  }
  if (!Number.isFinite(minX)) return null;
  const top = rf.flowToScreenPosition({ x: (minX + maxX) / 2, y: minY });
  const TITLEBAR_CLEARANCE = 56;
  const toolbarTop = Math.max(top.y - 56, TITLEBAR_CLEARANCE);

  return (
    <div className="selection-toolbar nodrag nopan" style={{ left: top.x, top: toolbarTop }}>
      {STRING_COLORS.map((color, i) => (
        <button
          key={color}
          type="button"
          className="swatch"
          style={{ background: `var(--string-${color})` }}
          title={`${color} (${i + 1})`}
          onClick={() => applyEdgeColor(color === 'red' ? null : color)}
        />
      ))}
      {anyPinned && (
        <>
          <span className="toolbar-divider" />
          <button
            type="button"
            title="Unpin ends — back to floating attachment"
            onClick={() => unpinSelectedEdges()}
          >
            ⊙
          </button>
        </>
      )}
      <span className="toolbar-divider" />
      <button type="button" title="Delete (⌫)" onClick={() => deleteSelection()}>
        🗑
      </button>
    </div>
  );
}
