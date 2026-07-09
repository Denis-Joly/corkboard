import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';

/** Pulsing placeholder while an asset import is in flight — the board
 *  responds instantly even for huge files. */
export const SkeletonNode = memo(function SkeletonNode({ data }: NodeProps) {
  return (
    <div className="card card-skeleton color-paper">
      <span className="skeleton-name">{String(data.name ?? '…')}</span>
    </div>
  );
});
