import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { ImageCard } from '../../model/schema';
import { useBoardStore } from '../../stores/boardStore';
import { assetUrl } from '../../tauri/assets';
import type { CardNode } from '../adapter';
import { CardChrome } from './CardChrome';

export const ImageNode = memo(function ImageNode({ data, selected }: NodeProps<CardNode>) {
  const card = data.card as ImageCard;
  const boardDir = useBoardStore((s) => s.boardDir);
  const src = boardDir && card.asset?.path ? assetUrl(boardDir, card.asset) : null;

  return (
    <CardChrome card={card} selected={selected}>
      {src ? (
        <img
          className="image-body"
          src={src}
          alt={card.asset.originalName}
          draggable={false}
        />
      ) : (
        <MissingAsset name={card.asset?.originalName ?? 'image'} />
      )}
    </CardChrome>
  );
});

/** Shown when the asset file isn't on disk (yet) — e.g. sync still
 *  delivering. The reference survives, so it self-heals. */
export function MissingAsset({ name }: { name: string }) {
  return (
    <div className="missing-asset">
      <span className="missing-name">{name}</span>
      <span className="missing-hint">missing — waiting for sync?</span>
    </div>
  );
}
