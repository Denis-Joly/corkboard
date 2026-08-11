import type { NodeProps } from '@xyflow/react';
import { memo, useLayoutEffect, useRef } from 'react';
import type { FrameCard } from '../../model/schema';
import { commitFrameTitle } from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';
import type { CardNode } from '../adapter';
import { CardChrome } from './CardChrome';

export const FrameNode = memo(function FrameNode({ id, data, selected }: NodeProps<CardNode>) {
  const card = data.card as FrameCard;
  const editing = useUiStore((s) => s.editingCardId === id);
  const flow = useBoardStore((s) => {
    const connection = s.doc.connections.find((k) => k.from === id || k.to === id);
    if (!connection) return null;
    return connection.to === id ? 'in' : 'out';
  });

  return (
    <CardChrome
      card={card}
      selected={selected}
      editing={editing}
      connectionDisabled={flow !== null}
    >
      <div className="frame-header">
        {editing ? <FrameTitleEditor card={card} /> : <span className="frame-title">{card.title}</span>}
        {flow && (
          <span className={`frame-flow frame-flow-${flow}`}>
            {flow === 'in' ? '← In' : 'Out →'}
          </span>
        )}
      </div>
      <div className="frame-hint">Double-click the title to rename</div>
    </CardChrome>
  );
});

function FrameTitleEditor({ card }: { card: FrameCard }) {
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    commitFrameTitle(card, ref.current?.value ?? card.title);
  };

  return (
    <input
      ref={ref}
      className="frame-title-editor nodrag nowheel"
      defaultValue={card.title}
      aria-label="Frame title"
      spellCheck={false}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          commit();
        }
        e.stopPropagation();
      }}
    />
  );
}
