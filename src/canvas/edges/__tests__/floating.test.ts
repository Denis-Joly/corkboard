import { describe, expect, it } from 'vitest';
import {
  anchorPoint,
  fractionInRect,
  perimeterPoint,
  rectCenter,
  resolveEndpoints,
  stringPath,
  stringPathBetween,
  type Rect,
} from '../floating';

const A: Rect = { x: 0, y: 0, w: 200, h: 100 };
const B: Rect = { x: 400, y: 300, w: 100, h: 100 };

describe('legacy floating geometry (regression pin)', () => {
  it('the no-anchor branch matches the original perimeter-to-perimeter math', () => {
    // The original implementation, verbatim: both ends aim at the other
    // card's CENTER. Existing boards must render pixel-identically.
    const legacyP1 = perimeterPoint(A, rectCenter(B));
    const legacyP2 = perimeterPoint(B, rectCenter(A));
    const { p1, p2 } = resolveEndpoints(A, B);
    expect(p1).toEqual(legacyP1);
    expect(p2).toEqual(legacyP2);
    const withUndefined = stringPath(A, B, undefined, undefined);
    const withNulls = stringPath(A, B, null, null);
    expect(withUndefined.path).toBe(withNulls.path);
    expect(withUndefined.p1).toEqual(legacyP1);
  });
});

describe('anchored endpoints', () => {
  it('resolves fractions against the card rect', () => {
    expect(anchorPoint(A, { x: 0.5, y: 0.5 })).toEqual({ x: 100, y: 50 });
    expect(anchorPoint(B, { x: 0, y: 1 })).toEqual({ x: 400, y: 400 });
  });

  it('a floating end aims at the other END POINT, not the card center', () => {
    // Pin near B's bottom-right corner; A's floating end must aim there.
    const toAnchor = { x: 1, y: 1 };
    const { p1, p2 } = resolveEndpoints(A, B, null, toAnchor);
    expect(p2).toEqual({ x: 500, y: 400 });
    const aimedAtPin = perimeterPoint(A, p2);
    const aimedAtCenter = perimeterPoint(A, rectCenter(B));
    expect(p1).toEqual(aimedAtPin);
    expect(p1).not.toEqual(aimedAtCenter);
  });

  it('both anchored uses both pins verbatim', () => {
    const { p1, p2 } = resolveEndpoints(A, B, { x: 0.25, y: 0.5 }, { x: 0.75, y: 0.1 });
    expect(p1).toEqual({ x: 50, y: 50 });
    expect(p2).toEqual({ x: 475, y: 310 });
  });
});

describe('directional tangent', () => {
  it('points the target arrow along the final cubic segment', () => {
    const { endAngle } = stringPathBetween({ x: 0, y: 0 }, { x: 100, y: 20 });
    expect(Number.isFinite(endAngle)).toBe(true);
    expect(Math.cos(endAngle)).toBeGreaterThan(0);
  });
});

describe('fractionInRect', () => {
  it('maps points to clamped fractions', () => {
    expect(fractionInRect(A, { x: 100, y: 25 })).toEqual({ x: 0.5, y: 0.25 });
    expect(fractionInRect(A, { x: -50, y: 500 })).toEqual({ x: 0, y: 1 });
  });

  it('degenerate rects fall back to the center', () => {
    expect(fractionInRect({ x: 0, y: 0, w: 0, h: 0 }, { x: 5, y: 5 })).toEqual({ x: 0.5, y: 0.5 });
  });
});
