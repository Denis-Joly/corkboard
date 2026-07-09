import { useMemo } from 'react';
import type { BoardDocument } from '../model/schema';
import { CARD_COLORS } from '../model/schema';

const W = 96;
const H = 64;
const PAD = 6;

/**
 * A live SVG thumbnail drawn straight from the document — colored
 * rects + red strings. No thumbnail files on disk, nothing to go stale.
 */
export function BoardPreview({ doc }: { doc: BoardDocument }) {
  const shapes = useMemo(() => {
    if (doc.cards.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of doc.cards) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.w);
      maxY = Math.max(maxY, c.y + c.h);
    }
    const scale = Math.min((W - PAD * 2) / (maxX - minX || 1), (H - PAD * 2) / (maxY - minY || 1));
    const ox = PAD + ((W - PAD * 2) - (maxX - minX) * scale) / 2;
    const oy = PAD + ((H - PAD * 2) - (maxY - minY) * scale) / 2;
    const tx = (x: number) => ox + (x - minX) * scale;
    const ty = (y: number) => oy + (y - minY) * scale;

    const centers = new Map(
      doc.cards.map((c) => [c.id, { x: tx(c.x + c.w / 2), y: ty(c.y + c.h / 2) }]),
    );
    return {
      rects: doc.cards.map((c) => ({
        key: c.id,
        x: tx(c.x),
        y: ty(c.y),
        w: Math.max(c.w * scale, 2),
        h: Math.max(c.h * scale, 2),
        color: (CARD_COLORS as readonly string[]).includes(c.color) ? c.color : 'paper',
      })),
      lines: doc.connections
        .map((k) => {
          const a = centers.get(k.from);
          const b = centers.get(k.to);
          return a && b ? { key: k.id, a, b } : null;
        })
        .filter((l): l is NonNullable<typeof l> => l !== null),
    };
  }, [doc]);

  return (
    <svg className="board-preview" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <rect width={W} height={H} rx={4} className="preview-bg" />
      {shapes?.lines.map((l) => (
        <line key={l.key} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} className="preview-string" />
      ))}
      {shapes?.rects.map((r) => (
        <rect
          key={r.key}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={1.5}
          className={`preview-card preview-${r.color}`}
        />
      ))}
    </svg>
  );
}
