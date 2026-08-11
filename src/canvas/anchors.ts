/**
 * Anchor gesture helpers shared by string creation (BoardCanvas) and pin
 * dragging (StringEdge): pin snapping, card hit-testing, and the handoff
 * of an Option-drag start point from the card handle to the connect-end
 * handler.
 */
import type { AnchorPoint, BoardDocument } from '../model/schema';
import { effectiveCardZ } from '../model/ops';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import { anchorPoint, type Point, type Rect } from './edges/floating';

/**
 * Topmost card whose rect contains `p`, honouring live drag positions
 * and React Flow's selection elevation (+1000, elevateNodesOnSelect),
 * so the hit answer matches what is actually painted on top.
 */
export function topCardAt(p: Point): { id: string; rect: Rect } | null {
  const doc = useBoardStore.getState().doc;
  const { transient, selection } = useUiStore.getState();
  let best: { id: string; rect: Rect; z: number } | null = null;
  for (const card of doc.cards) {
    const t = transient.get(card.id);
    const rect: Rect = {
      x: t?.x ?? card.x,
      y: t?.y ?? card.y,
      w: t?.w ?? card.w,
      h: t?.h ?? card.h,
    };
    const z = effectiveCardZ(doc, card) + (selection.has(card.id) ? 1000 : 0);
    if (
      p.x >= rect.x &&
      p.x <= rect.x + rect.w &&
      p.y >= rect.y &&
      p.y <= rect.y + rect.h &&
      (!best || z > best.z)
    ) {
      best = { id: card.id, rect, z };
    }
  }
  return best ? { id: best.id, rect: best.rect } : null;
}

/** Screen-pixel radius within which a new pin merges onto an existing one. */
export const PIN_SNAP_SCREEN_PX = 12;

/**
 * All anchors already pinned on `cardId` (both ends of every connection),
 * excluding `excludeConnId` (the connection being edited, so a dragged
 * pin doesn't snap to itself).
 */
export function anchorsOnCard(
  doc: BoardDocument,
  cardId: string,
  excludeConnId?: string,
): AnchorPoint[] {
  const anchors: AnchorPoint[] = [];
  for (const conn of doc.connections) {
    if (conn.id === excludeConnId) continue;
    if (conn.from === cardId && conn.fromAnchor) anchors.push(conn.fromAnchor);
    if (conn.to === cardId && conn.toAnchor) anchors.push(conn.toAnchor);
  }
  return anchors;
}

/**
 * If `candidate` lands within PIN_SNAP_SCREEN_PX (screen px, so zoom-
 * aware) of an existing pin on the card, return that pin's exact
 * fractions — coincident pins then read as ONE pin holding several
 * strings, the detective-board look, at zero schema cost.
 */
export function snapAnchor(
  candidate: AnchorPoint,
  rect: Rect,
  existing: AnchorPoint[],
  zoom: number,
): AnchorPoint {
  const cand = anchorPoint(rect, candidate);
  const radiusFlow = PIN_SNAP_SCREEN_PX / Math.max(zoom, 0.01);
  let best: AnchorPoint | null = null;
  let bestDist = radiusFlow;
  for (const a of existing) {
    const p = anchorPoint(rect, a);
    const dist = Math.hypot(p.x - cand.x, p.y - cand.y);
    if (dist <= bestDist) {
      best = a;
      bestDist = dist;
    }
  }
  return best ? { x: best.x, y: best.y } : candidate;
}

export function pointInRect(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

/**
 * The exact point on a card where an Option-drag started, recorded by
 * the free source handle's pointerdown and consumed once in
 * onConnectEnd. A module ref, not store state: it lives for the length
 * of one gesture and must never cause renders.
 */
let pendingFreeAnchor: AnchorPoint | null = null;

export function setPendingFreeAnchor(a: AnchorPoint | null) {
  pendingFreeAnchor = a;
}

/** Non-consuming read, for the live connection line. */
export function peekPendingFreeAnchor(): AnchorPoint | null {
  return pendingFreeAnchor;
}

export function takePendingFreeAnchor(): AnchorPoint | null {
  const a = pendingFreeAnchor;
  pendingFreeAnchor = null;
  return a;
}
