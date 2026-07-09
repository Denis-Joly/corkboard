/**
 * Floating-edge geometry: connections attach to card ids only (no
 * persisted handles), so the view computes attachment points — the
 * intersection of the center-to-center line with each card's perimeter.
 */

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

/** Cubic bezier between two rect perimeters with gravity sag. */
export function stringPath(a: Rect, b: Rect): StringPath {
  const p1 = perimeterPoint(a, rectCenter(b));
  const p2 = perimeterPoint(b, rectCenter(a));
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
