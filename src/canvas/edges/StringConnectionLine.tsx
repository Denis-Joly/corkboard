import type { ConnectionLineComponentProps } from '@xyflow/react';
import { peekPendingFreeAnchor } from '../anchors';
import type { CardNode } from '../adapter';
import { anchorPoint, stringPathBetween, type Point } from './floating';

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
  toX,
  toY,
}: ConnectionLineComponentProps<CardNode>) {
  let start: Point = { x: fromX, y: fromY };
  const pending = peekPendingFreeAnchor();
  if (pending && fromHandle?.id === 'free') {
    const { x, y } = fromNode.internals.positionAbsolute;
    const w = fromNode.measured?.width ?? fromNode.width ?? 0;
    const h = fromNode.measured?.height ?? fromNode.height ?? 0;
    if (w > 0 && h > 0) start = anchorPoint({ x, y, w, h }, pending);
  }
  const { path } = stringPathBetween(start, { x: toX, y: toY });
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
      <circle cx={toX} cy={toY} r={4} fill="var(--pin-red)" />
    </g>
  );
}
