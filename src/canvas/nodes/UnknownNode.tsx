import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { CardNode } from '../adapter';
import { CardChrome } from './CardChrome';

/**
 * A card whose type this app version doesn't understand (or whose data
 * is damaged). Inert but movable/deletable; every field it arrived with
 * serializes back verbatim.
 */
export const UnknownNode = memo(function UnknownNode({ data, selected }: NodeProps<CardNode>) {
  const card = data.card;
  return (
    <CardChrome card={card} selected={selected} className="card-unknown">
      <div className="unknown-body">
        <span className="unknown-kind">{String(card.type)}</span>
        <span className="unknown-hint">made by a newer version</span>
      </div>
    </CardChrome>
  );
});
