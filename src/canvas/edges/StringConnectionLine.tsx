import { useViewport, type ConnectionLineComponentProps } from '@xyflow/react';
import { peekPendingFreeAnchor } from '../anchors';
import type { CardNode } from '../adapter';
import { connectionPreviewPoints } from './connectionPreview';
import { stringPathBetween } from './floating';

/**
 * The in-flight string while a connection is dragged: same sagging
 * cubic and pin head as a committed string, so what you see is what
 * you get. An Option-drag starts at the exact grabbed point (the
 * pending free anchor); a top-pin drag starts at the handle.
 */
export function StringConnectionLine({
  fromNode,
  fromHandle,
  fromX,
  fromY,
  pointer,
}: ConnectionLineComponentProps<CardNode>) {
  const pending = peekPendingFreeAnchor();
  const viewport = useViewport();
  const { start, end } = connectionPreviewPoints({
    from: { x: fromX, y: fromY },
    pointer,
    freeAnchor: fromHandle?.id === 'free' ? pending : null,
    nodeSize: {
      width: fromNode.measured?.width ?? fromNode.width ?? 0,
      height: fromNode.measured?.height ?? fromNode.height ?? 0,
    },
    viewport,
  });
  const { path } = stringPathBetween(start, end);
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="var(--string-red)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {pending && fromHandle?.id === 'free' && (
        <circle cx={start.x} cy={start.y} r={4} fill="var(--pin-red)" />
      )}
      <circle cx={end.x} cy={end.y} r={4} fill="var(--pin-red)" />
    </g>
  );
}
