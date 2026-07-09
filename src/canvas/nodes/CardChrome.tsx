import { Handle, Position, useConnection } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { Card } from '../../model/schema';
import { colorClass } from '../styleTokens';

interface CardChromeProps {
  card: Card;
  selected: boolean;
  editing?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Shared card shell: color token class, selection ring, and the
 * connection gesture — a red pin above the card starts a string
 * (source handle); an invisible handle covering the whole card catches
 * the other end, pointer-enabled only while a connection drag is live
 * so it never steals normal clicks/drags.
 */
export function CardChrome({ card, selected, editing, className, children }: CardChromeProps) {
  const connectionInProgress = useConnection((c) => c.inProgress);

  const classes = [
    'card',
    `card-${card.type}`,
    colorClass(card.color),
    selected ? 'is-selected' : '',
    editing ? 'is-editing' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {children}
      <Handle
        type="source"
        position={Position.Top}
        className="pin-handle"
        isConnectableEnd={false}
      />
      <Handle
        type="target"
        position={Position.Top}
        className={`target-handle ${connectionInProgress ? 'is-live' : ''}`}
        isConnectableStart={false}
      />
    </div>
  );
}
