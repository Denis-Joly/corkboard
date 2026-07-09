/**
 * String-edge geometry. A connection endpoint is either FLOATING (the
 * legacy default: the view aims at the card perimeter) or ANCHORED at a
 * stored fraction of the card's rect (a pin on a map city). Floating
 * ends aim at the other end's RESOLVED point, so a string to a pinned
 * city leaves the right spot; the both-floating branch reproduces the
 * original perimeter math exactly (pinned by a regression test).
 */
import type { AnchorPoint } from '../../model/schema';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Resolve a stored fractional anchor to canvas coordinates. */
export function anchorPoint(rect: Rect, a: AnchorPoint): Point {
  return { x: rect.x + a.x * rect.w, y: rect.y + a.y * rect.h };
}

/** The fraction of `rect` under `p`, clamped into the rect. */
export function fractionInRect(rect: Rect, p: Point): AnchorPoint {
  return {
    x: rect.w > 0 ? Math.min(Math.max((p.x - rect.x) / rect.w, 0), 1) : 0.5,
    y: rect.h > 0 ? Math.min(Math.max((p.y - rect.y) / rect.h, 0), 1) : 0.5,
  };
}

export function resolveEndpoints(
  a: Rect,
  b: Rect,
  fromAnchor?: AnchorPoint | null,
  toAnchor?: AnchorPoint | null,
): { p1: Point; p2: Point } {
  if (fromAnchor && toAnchor) {
    return { p1: anchorPoint(a, fromAnchor), p2: anchorPoint(b, toAnchor) };
  }
  if (fromAnchor) {
    const p1 = anchorPoint(a, fromAnchor);
    return { p1, p2: perimeterPoint(b, p1) };
  }
  if (toAnchor) {
    const p2 = anchorPoint(b, toAnchor);
    return { p1: perimeterPoint(a, p2), p2 };
  }
  // Legacy branch — keep byte-identical to the original implementation.
  return {
    p1: perimeterPoint(a, rectCenter(b)),
    p2: perimeterPoint(b, rectCenter(a)),
  };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Where the segment from `rect`'s center toward `toward` crosses its edge. */
export function perimeterPoint(rect: Rect, toward: Point): Point {
  const c = rectCenter(rect);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const scaleX = dx !== 0 ? rect.w / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = dy !== 0 ? rect.h / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const t = Math.min(scaleX, scaleY);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

const SAG_RATIO = 0.13;

export interface StringPath {
  path: string;
  /** Ends of the string, for pin heads. */
  p1: Point;
  p2: Point;
  /** Point at t = 0.5 on the curve, for the label. */
  mid: Point;
}

/** Sagging cubic between two already-resolved endpoints. */
export function stringPathBetween(p1: Point, p2: Point): StringPath {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const sag = Math.hypot(dx, dy) * SAG_RATIO;
  const c1 = { x: p1.x + dx / 3, y: p1.y + dy / 3 + sag };
  const c2 = { x: p1.x + (2 * dx) / 3, y: p1.y + (2 * dy) / 3 + sag };
  const path = `M ${p1.x},${p1.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  // Cubic bezier at t = 0.5.
  const mid = {
    x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
    y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8,
  };
  return { path, p1, p2, mid };
}

/** Cubic bezier between two cards with gravity sag, honouring anchors. */
export function stringPath(
  a: Rect,
  b: Rect,
  fromAnchor?: AnchorPoint | null,
  toAnchor?: AnchorPoint | null,
): StringPath {
  const { p1, p2 } = resolveEndpoints(a, b, fromAnchor, toAnchor);
  return stringPathBetween(p1, p2);
}
