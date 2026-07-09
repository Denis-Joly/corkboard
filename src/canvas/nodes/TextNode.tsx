import type { NodeProps } from '@xyflow/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { TextCard } from '../../model/schema';
import { commitTextEditor } from '../../stores/actions';
import { useUiStore } from '../../stores/uiStore';
import { openExternalUrl } from '../../tauri/opener';
import type { CardNode } from '../adapter';
import { renderMarkdown } from '../markdown';
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
        <TextBody card={card} />
      )}
    </CardChrome>
  );
});

function TextBody({ card }: { card: TextCard }) {
  const html = useMemo(() => renderMarkdown(card.text), [card.text]);

  return (
    <div
      className={`text-body markdown-body ${styleClass(card)}`}
      onClick={openLinkExternally}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * A rendered link must never navigate the webview itself (that would
 * replace the whole app); hand it to the OS browser instead. markdown-it
 * already rejects javascript:/data: hrefs, the scheme check is a second
 * fence. window.open covers running in a plain browser during dev.
 */
function openLinkExternally(e: ReactMouseEvent) {
  const anchor = (e.target as HTMLElement).closest('a');
  if (!anchor) return;
  e.preventDefault();
  const href = anchor.getAttribute('href');
  if (href && /^(https?:|mailto:)/i.test(href)) {
    openExternalUrl(href).catch(() => window.open(href, '_blank', 'noopener'));
  }
}

function TextEditor({ card, isDraft }: { card: TextCard; isDraft: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const committed = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // WKWebView (and React Flow's own pane focusing) can steal focus
    // back right after mount — retry until the focus actually sticks.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryFocus = () => {
      if (!el.isConnected) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      if (document.activeElement !== el && tries++ < 10) {
        timer = setTimeout(tryFocus, 30);
      }
    };
    tryFocus();
    autoGrow(el);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const commit = () => {
    const el = ref.current;
    if (!el || committed.current) return;
    committed.current = true;
    // offsetHeight ignores the canvas zoom transform → flow units.
    const cardEl = el.closest('.card') as HTMLElement | null;
    const text = el.value;
    const measuredH = cardEl ? measureRenderedHeight(text, card, cardEl) : card.h;
    commitTextEditor(card, isDraft, text, measuredH);
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

/**
 * The card switches from raw source (textarea) to rendered Markdown/KaTeX
 * on blur, and rendered height can differ from the source text's height
 * (equations especially). Render offscreen at the card's actual width to
 * measure what will really be displayed, so the persisted height fits it.
 */
function measureRenderedHeight(text: string, card: TextCard, cardEl: HTMLElement): number {
  const probe = document.createElement('div');
  probe.className = `text-body markdown-body ${styleClass(card)}`;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.left = '-9999px';
  probe.style.top = '0';
  probe.style.width = `${cardEl.clientWidth}px`;
  probe.innerHTML = renderMarkdown(text);
  document.body.appendChild(probe);
  const height = probe.scrollHeight;
  probe.remove();
  return height;
}
