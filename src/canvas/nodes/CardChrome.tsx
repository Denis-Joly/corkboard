import { Handle, NodeResizer, Position, useConnection, useNodeId } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { Card } from '../../model/schema';
import { commitResize } from '../../stores/actions';
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
  const nodeId = useNodeId();

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

  // The handles live on an UNCLIPPED shell: the card body clips its
  // content (rounded corners, image crop), but the pin floats above
  // the card edge and must never be cut off.
  return (
    <div className="card-shell">
      <div className={classes}>{children}</div>
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={card.type === 'image' ? 48 : 120}
        minHeight={card.type === 'image' ? 48 : 40}
        keepAspectRatio={card.type === 'image'}
        onResizeEnd={() => {
          if (nodeId) commitResize(nodeId);
        }}
      />
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
