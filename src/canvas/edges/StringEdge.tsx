import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, useInternalNode } from '@xyflow/react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { retargetConnectionEnd, setConnectionLabel } from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';
import { anchorsOnCard, snapAnchor } from '../anchors';
import type { StringEdge as StringEdgeType } from '../adapter';
import { rfRef } from '../rfInstance';
import {
  anchorPoint,
  fractionInRect,
  perimeterPoint,
  resolveEndpoints,
  stringPathBetween,
  type Point,
  type Rect,
} from './floating';

function nodeRect(internal: ReturnType<typeof useInternalNode>): Rect | null {
  if (!internal) return null;
  const { x, y } = internal.internals.positionAbsolute;
  const w = internal.measured?.width ?? internal.width ?? 0;
  const h = internal.measured?.height ?? internal.height ?? 0;
  if (w === 0 || h === 0) return null;
  return { x, y, w, h };
}

type EndKey = 'from' | 'to';

interface PinDrag {
  end: EndKey;
  point: Point;
}

/** Topmost doc card whose rect contains `p` (hit-test by descending z). */
function cardAt(p: Point): { id: string; rect: Rect } | null {
  const doc = useBoardStore.getState().doc;
  const transient = useUiStore.getState().transient;
  let best: { id: string; rect: Rect; z: number } | null = null;
  for (const card of doc.cards) {
    const t = transient.get(card.id);
    const rect: Rect = {
      x: t?.x ?? card.x,
      y: t?.y ?? card.y,
      w: t?.w ?? card.w,
      h: t?.h ?? card.h,
    };
    if (
      p.x >= rect.x &&
      p.x <= rect.x + rect.w &&
      p.y >= rect.y &&
      p.y <= rect.y + rect.h &&
      (!best || card.z > best.z)
    ) {
      best = { id: card.id, rect, z: card.z };
    }
  }
  return best ? { id: best.id, rect: best.rect } : null;
}

export const StringEdgeComponent = memo(function StringEdgeComponent({
  id,
  source,
  target,
  selected,
  data,
}: EdgeProps<StringEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const [drag, setDrag] = useState<PinDrag | null>(null);
  // The drag lifecycle outlives any single render; handlers live on
  // window so a pointerup outside the webview view never strands it.
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), []);

  const a = nodeRect(sourceNode);
  const b = nodeRect(targetNode);
  if (!a || !b || !sourceNode || !targetNode) return null;

  const connection = data?.connection;
  const editing = data?.editingLabel === true;
  const label = connection?.label ?? null;
  const dashed = connection?.kind === 'dashed';
  const fromAnchor = connection?.fromAnchor ?? null;
  const toAnchor = connection?.toAnchor ?? null;

  // While a pin is dragged, that endpoint follows the pointer and a
  // floating other end re-aims at it live; nothing is committed until
  // the drop.
  let p1: Point;
  let p2: Point;
  if (drag?.end === 'from') {
    p1 = drag.point;
    p2 = toAnchor ? anchorPoint(b, toAnchor) : perimeterPoint(b, p1);
  } else if (drag?.end === 'to') {
    p2 = drag.point;
    p1 = fromAnchor ? anchorPoint(a, fromAnchor) : perimeterPoint(a, p2);
  } else {
    ({ p1, p2 } = resolveEndpoints(a, b, fromAnchor, toAnchor));
  }
  const { path, mid } = stringPathBetween(p1, p2);

  const startPinDrag = (end: EndKey) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const toFlow = (ev: PointerEvent | React.PointerEvent) =>
      rfRef.current?.screenToFlowPosition({ x: ev.clientX, y: ev.clientY }) ?? null;
    const start = toFlow(e);
    if (!start) return;
    setDrag({ end, point: start });

    const onMove = (ev: PointerEvent) => {
      const p = toFlow(ev);
      if (!p) return;
      setDrag({ end, point: p });
      useUiStore.getState().setPinDragTarget(cardAt(p)?.id ?? null);
    };
    const finish = (commit: boolean, ev?: PointerEvent) => {
      dragCleanup.current?.();
      dragCleanup.current = null;
      useUiStore.getState().setPinDragTarget(null);
      setDrag(null);
      if (!commit || !ev) return;
      const p = toFlow(ev);
      if (!p) return;
      const hit = cardAt(p);
      if (!hit) return; // dropped on cork → revert, nothing committed
      const doc = useBoardStore.getState().doc;
      const zoom = rfRef.current?.getViewport().zoom ?? 1;
      const anchor = snapAnchor(
        fractionInRect(hit.rect, p),
        hit.rect,
        anchorsOnCard(doc, hit.id, id),
        zoom,
      );
      retargetConnectionEnd(id, end, hit.id, anchor);
    };
    const onUp = (ev: PointerEvent) => finish(true, ev);
    const onCancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') finish(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    window.addEventListener('keydown', onKey, true);
    dragCleanup.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('keydown', onKey, true);
    };
  };

  const unpin = (end: EndKey) => () => {
    const cardId = end === 'from' ? connection!.from : connection!.to;
    retargetConnectionEnd(id, end, cardId, null);
  };

  // Anchored pins render as HTML dots ABOVE their card (internals.z
  // tracks selection elevation); floating ends keep the legacy SVG
  // circle below the cards, pixel-identical to pre-anchor boards.
  const pinZFrom = (sourceNode.internals.z || 0) + 1;
  const pinZTo = (targetNode.internals.z || 0) + 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`string-edge ${selected ? 'is-selected' : ''}`}
        style={{
          stroke: 'var(--string-red)',
          strokeWidth: selected ? 3 : 2,
          strokeLinecap: 'round',
          strokeDasharray: dashed ? '6 6' : undefined,
        }}
        interactionWidth={20}
      />
      {(fromAnchor === null || drag?.end === 'from') && (
        <FloatingPin p={p1} onPointerDown={startPinDrag('from')} />
      )}
      {(toAnchor === null || drag?.end === 'to') && (
        <FloatingPin p={p2} onPointerDown={startPinDrag('to')} />
      )}
      <EdgeLabelRenderer>
        {fromAnchor !== null && drag?.end !== 'from' && (
          <AnchoredPin
            p={p1}
            z={pinZFrom}
            selected={selected}
            onPointerDown={startPinDrag('from')}
            onDoubleClick={unpin('from')}
          />
        )}
        {toAnchor !== null && drag?.end !== 'to' && (
          <AnchoredPin
            p={p2}
            z={pinZTo}
            selected={selected}
            onPointerDown={startPinDrag('to')}
            onDoubleClick={unpin('to')}
          />
        )}
        {(label !== null || editing) && (
          <div
            className="edge-label nopan nodrag"
            style={{
              transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
              pointerEvents: 'all',
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              useUiStore.getState().setEditingEdge(id);
            }}
          >
            {editing ? <LabelEditor edgeId={id} initial={label ?? ''} /> : <span>{label}</span>}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
});

/** Legacy floating pin: the exact SVG circle boards have always shown,
 *  plus an invisible hit circle so the end can be picked up and pinned. */
function FloatingPin({
  p,
  onPointerDown,
}: {
  p: Point;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <>
      <circle className="string-pin" cx={p.x} cy={p.y} r={4} />
      <circle
        className="string-pin-hit"
        cx={p.x}
        cy={p.y}
        r={10}
        onPointerDown={onPointerDown}
      />
    </>
  );
}

/** A placed pin: an HTML dot painted above its card (double-click frees it). */
function AnchoredPin({
  p,
  z,
  selected,
  onPointerDown,
  onDoubleClick,
}: {
  p: Point;
  z: number;
  selected?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className={`anchor-pin nopan nodrag ${selected ? 'is-selected' : ''}`}
      style={{
        transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
        zIndex: z,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    />
  );
}

function LabelEditor({ edgeId, initial }: { edgeId: string; initial: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    setConnectionLabel(edgeId, ref.current?.value ?? null);
  };

  return (
    <input
      ref={ref}
      className="edge-label-editor nodrag nowheel"
      defaultValue={initial}
      spellCheck={false}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          commit();
        }
        e.stopPropagation();
      }}
    />
  );
}
