import type { NodeProps } from '@xyflow/react';
import { memo, useLayoutEffect, useRef } from 'react';
import type { TextCard } from '../../model/schema';
import { commitTextEditor } from '../../stores/actions';
import { useUiStore } from '../../stores/uiStore';
import type { CardNode } from '../adapter';
import { styleClass } from '../styleTokens';
import { CardChrome } from './CardChrome';

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<CardNode>) {
  const card = data.card as TextCard;
  const isDraft = data.isDraft === true;
  const editing = useUiStore((s) => s.editingCardId === id) || isDraft;

  return (
    <CardChrome card={card} selected={selected} editing={editing}>
      {editing ? (
        <TextEditor card={card} isDraft={isDraft} />
      ) : (
        <div className={`text-body ${styleClass(card)}`}>{card.text}</div>
      )}
    </CardChrome>
  );
});

function TextEditor({ card, isDraft }: { card: TextCard; isDraft: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const committed = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const focus = () => {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    };
    focus();
    autoGrow(el);
    // Re-assert focus one frame later in case the canvas' own click
    // handling lands after the editor mounts (double-click timing).
    const raf = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(raf);
  }, []);

  const commit = () => {
    const el = ref.current;
    if (!el || committed.current) return;
    committed.current = true;
    // offsetHeight ignores the canvas zoom transform → flow units.
    const cardEl = el.closest('.card') as HTMLElement | null;
    const measuredH = cardEl?.offsetHeight ?? card.h;
    commitTextEditor(card, isDraft, el.value, measuredH);
  };

  return (
    <textarea
      ref={ref}
      className={`nodrag nowheel text-editor ${styleClass(card)}`}
      defaultValue={card.text}
      placeholder="Type…"
      spellCheck={false}
      onInput={(e) => autoGrow(e.currentTarget)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && e.metaKey)) {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
