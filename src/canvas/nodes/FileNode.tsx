import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { FileCard } from '../../model/schema';
import type { CardNode } from '../adapter';
import { CardChrome } from './CardChrome';

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 5) : 'FILE';
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Deterministic tint per extension so file kinds are scannable. */
function extHue(ext: string): number {
  let h = 0;
  for (const c of ext) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export const FileNode = memo(function FileNode({ data, selected }: NodeProps<CardNode>) {
  const card = data.card as FileCard;
  const name = card.asset?.originalName ?? 'file';
  const ext = extension(name);
  return (
    <CardChrome card={card} selected={selected}>
      <div className="file-body" title={name}>
        <span
          className="file-badge"
          style={{ backgroundColor: `hsl(${extHue(ext)} 45% 52% / 0.85)` }}
        >
          {ext}
        </span>
        <span className="file-meta">
          <span className="file-name">{name}</span>
          <span className="file-size">{formatBytes(card.asset?.byteSize ?? 0)}</span>
        </span>
      </div>
    </CardChrome>
  );
});
