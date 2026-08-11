import { describe, expect, it } from 'vitest';
import { connectionPreviewPoints } from '../connectionPreview';

describe('connectionPreviewPoints', () => {
  it('keeps the live end under the pointer instead of the snapped handle centre', () => {
    const points = connectionPreviewPoints({
      from: { x: 100, y: 80 },
      pointer: { x: 487, y: 319 },
      nodeSize: { width: 240, height: 120 },
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(points).toEqual({
      start: { x: 100, y: 80 },
      end: { x: 487, y: 319 },
    });
  });

  it.each([
    { viewport: { x: -120, y: 40, zoom: 0.08 }, end: { x: 10_250, y: 5_750 } },
    { viewport: { x: 0, y: 0, zoom: 1 }, end: { x: 700, y: 500 } },
    { viewport: { x: 100, y: -300, zoom: 4 }, end: { x: 150, y: 200 } },
  ])(
    'keeps the exact free start in flow space at zoom $viewport.zoom',
    ({ viewport, end: expectedEnd }) => {
      const { start, end } = connectionPreviewPoints({
        // The full-card free handle is centred here in flow space.
        from: { x: 300, y: 200 },
        pointer: { x: 700, y: 500 },
        freeAnchor: { x: 0, y: 0 },
        nodeSize: { width: 240, height: 100 },
        viewport,
      });

      expect(start).toEqual({ x: 180, y: 150 });
      expect(end.x).toBeCloseTo(expectedEnd.x);
      expect(end.y).toBeCloseTo(expectedEnd.y);
    },
  );

  it('converts the renderer pointer through both viewport pan and zoom', () => {
    const { end } = connectionPreviewPoints({
      from: { x: 100, y: 80 },
      pointer: { x: 487, y: 319 },
      nodeSize: { width: 240, height: 120 },
      viewport: { x: 40, y: -20, zoom: 2 },
    });

    expect(end).toEqual({ x: 223.5, y: 169.5 });
  });
});
