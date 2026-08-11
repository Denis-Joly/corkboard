import type { AnchorPoint } from '../../model/schema';
import type { Point } from './floating';

export interface ConnectionPreviewInput {
  /** React Flow flow coordinates (the transformed connection-line SVG space). */
  from: Point;
  /** The live pointer in renderer/container pixels. */
  pointer: Point;
  /** Exact source-card fraction for an Option-drag, when present. */
  freeAnchor?: AnchorPoint | null;
  /** Source-node size in flow units. */
  nodeSize: { width: number; height: number };
  /** Current flow-to-renderer transform. */
  viewport: { x: number; y: number; zoom: number };
}

/**
 * Resolve the two points used by the in-flight string.
 *
 * React Flow gives `from` in flow coordinates but keeps `pointer` in
 * renderer/container pixels. The connection-line SVG itself is inside
 * the transformed viewport, so the pointer must be converted back to
 * flow coordinates. The end deliberately follows that pointer instead
 * of React Flow's snapped target-handle centre, so entering a large card
 * never teleports the string away from the release point.
 */
export function connectionPreviewPoints({
  from,
  pointer,
  freeAnchor,
  nodeSize,
  viewport,
}: ConnectionPreviewInput): { start: Point; end: Point } {
  const end = {
    x: (pointer.x - viewport.x) / viewport.zoom,
    y: (pointer.y - viewport.y) / viewport.zoom,
  };

  if (!freeAnchor) return { start: from, end };

  return {
    start: {
      x: from.x + (freeAnchor.x - 0.5) * nodeSize.width,
      y: from.y + (freeAnchor.y - 0.5) * nodeSize.height,
    },
    end,
  };
}
