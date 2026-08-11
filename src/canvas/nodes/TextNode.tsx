import { NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TEXT_ALIGNS, type TextAlign, type TextCard } from '../../model/schema';
import { commitTextEditor } from '../../stores/actions';
import { useUiStore } from '../../stores/uiStore';
import { openExternalUrl } from '../../tauri/opener';
import type { CardNode } from '../adapter';
import { renderMarkdown } from '../markdown';
import { styleClass, textAlignClass } from '../styleTokens';
import { resolveTextAlign, wrapOrUnwrapSelection } from '../textFormatting';
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
      className={`text-body markdown-body ${styleClass(card)} ${textAlignClass(card)}`}
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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const committed = useRef(false);
  const composing = useRef(false);
  const alignmentTouched = useRef(false);
  const alignmentRef = useRef<TextAlign>(resolveTextAlign(card.textAlign));
  const [alignment, setAlignment] = useState(alignmentRef.current);

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
    const measuredH = cardEl
      ? measureRenderedHeight(text, card, cardEl, alignmentRef.current)
      : card.h;
    commitTextEditor(
      card,
      isDraft,
      text,
      measuredH,
      alignmentRef.current,
      alignmentTouched.current,
    );
  };

  const commitWhenFocusLeaves = () => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active === ref.current || (active && toolbarRef.current?.contains(active))) return;
      commit();
    }, 0);
  };

  const applyMarkers = (open: string, close: string, placeholder: string) => {
    const el = ref.current;
    if (!el || composing.current) return;
    const transformed = wrapOrUnwrapSelection(
      el.value,
      el.selectionStart,
      el.selectionEnd,
      el.selectionDirection,
      open,
      close,
      placeholder,
    );
    el.focus({ preventScroll: true });
    el.setRangeText(
      transformed.replacement,
      transformed.editStart,
      transformed.editEnd,
      'preserve',
    );
    el.setSelectionRange(
      transformed.selectionStart,
      transformed.selectionEnd,
      transformed.selectionDirection,
    );
    autoGrow(el);
  };

  const chooseAlignment = (next: TextAlign) => {
    alignmentTouched.current = true;
    alignmentRef.current = next;
    setAlignment(next);
    ref.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <NodeToolbar
        className="text-format-toolbar nodrag nopan"
        position={Position.Top}
        offset={10}
        isVisible
        role="toolbar"
        aria-label="Text formatting"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        onBlurCapture={commitWhenFocusLeaves}
      >
        <div ref={toolbarRef} className="text-format-toolbar-inner">
          <button
            type="button"
            className="text-mark-button"
            aria-label="Bold"
            aria-keyshortcuts="Meta+B Control+B"
            title="Bold (⌘B)"
            onClick={() => applyMarkers('**', '**', 'bold')}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="text-mark-button"
            aria-label="Italic"
            aria-keyshortcuts="Meta+I Control+I"
            title="Italic (⌘I)"
            onClick={() => applyMarkers('*', '*', 'italic')}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="text-mark-button"
            aria-label="Underline"
            aria-keyshortcuts="Meta+U Control+U"
            title="Underline (⌘U)"
            onClick={() => applyMarkers('++', '++', 'underlined')}
          >
            <u>U</u>
          </button>
          <button
            type="button"
            className="text-mark-button text-equation-button"
            aria-label="Inline equation"
            title="Inline equation ($…$); use $$…$$ for display"
            onClick={() => applyMarkers('$', '$', 'equation')}
          >
            ƒx
          </button>
          <span className="toolbar-divider" role="separator" />
          {TEXT_ALIGNS.map((align) => (
            <button
              key={align}
              type="button"
              className={alignment === align ? 'is-active' : ''}
              aria-label={alignmentLabel(align)}
              aria-pressed={alignment === align}
              title={alignmentLabel(align)}
              onClick={() => chooseAlignment(align)}
            >
              <AlignmentIcon alignment={align} />
            </button>
          ))}
        </div>
      </NodeToolbar>
      <textarea
        ref={ref}
        className={`nodrag nowheel text-editor ${styleClass(card)} text-align-${alignment}`}
        defaultValue={card.text}
        placeholder="Type…"
        spellCheck={false}
        onInput={(e) => autoGrow(e.currentTarget)}
        onBlur={commitWhenFocusLeaves}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(e) => {
          const modifier = e.metaKey || e.ctrlKey;
          if (modifier && !e.altKey && !e.shiftKey) {
            const key = e.key.toLowerCase();
            if (key === 'b' || key === 'i' || key === 'u') {
              e.preventDefault();
              if (key === 'b') applyMarkers('**', '**', 'bold');
              if (key === 'i') applyMarkers('*', '*', 'italic');
              if (key === 'u') applyMarkers('++', '++', 'underlined');
              return;
            }
          }
          if (e.key === 'Escape' || (e.key === 'Enter' && e.metaKey)) {
            e.preventDefault();
            commit();
          }
        }}
      />
    </>
  );
}

function AlignmentIcon({ alignment }: { alignment: TextAlign }) {
  return (
    <span className={`text-align-icon text-align-icon-${alignment}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function alignmentLabel(alignment: TextAlign): string {
  return alignment === 'justify' ? 'Justify text' : `Align ${alignment}`;
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
function measureRenderedHeight(
  text: string,
  card: TextCard,
  cardEl: HTMLElement,
  alignment: TextAlign,
): number {
  const probe = document.createElement('div');
  probe.className = `text-body markdown-body ${styleClass(card)} text-align-${alignment}`;
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
