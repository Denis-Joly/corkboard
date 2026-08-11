/**
 * Text-card content is Markdown source (plain string, per model/schema.ts).
 * html:false keeps literal '<' / '>' in notes as escaped text rather than
 * interpreted tags — there's no trusted/untrusted boundary here since it's
 * the user's own local content, but there's also no reason to parse HTML.
 */
import MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import texmath from 'markdown-it-texmath';
import katex from 'katex';

const UNDERLINE_MARKER = 0x2b; // +

function underlineTokenize(state: StateInline, silent: boolean): boolean {
  if (silent || state.src.charCodeAt(state.pos) !== UNDERLINE_MARKER) return false;
  const scanned = state.scanDelims(state.pos, true);
  let length = scanned.length;
  if (length < 2) return false;

  if (length % 2 === 1) {
    const lone = state.push('text', '', 0);
    lone.content = '+';
    length -= 1;
  }
  for (let i = 0; i < length; i += 2) {
    const token = state.push('text', '', 0);
    token.content = '++';
    state.delimiters.push({
      marker: UNDERLINE_MARKER,
      length: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close,
    });
  }
  state.pos += scanned.length;
  return true;
}

function applyUnderlineDelimiters(
  state: StateInline,
  delimiters: StateInline['delimiters'],
) {
  const loneMarkers: number[] = [];
  for (const start of delimiters) {
    if (start.marker !== UNDERLINE_MARKER || start.end === -1) continue;
    const end = delimiters[start.end];
    const openToken = state.tokens[start.token];
    openToken.type = 'underline_open';
    openToken.tag = 'u';
    openToken.nesting = 1;
    openToken.markup = '++';
    openToken.content = '';
    const closeToken = state.tokens[end.token];
    closeToken.type = 'underline_close';
    closeToken.tag = 'u';
    closeToken.nesting = -1;
    closeToken.markup = '++';
    closeToken.content = '';
    const beforeClose = state.tokens[end.token - 1];
    if (beforeClose?.type === 'text' && beforeClose.content === '+') {
      loneMarkers.push(end.token - 1);
    }
  }

  // Odd runs are tokenized as `+` + pairs. Move that lone marker past
  // adjacent closing tags so +++text+++ becomes +<u>text</u>+.
  while (loneMarkers.length > 0) {
    const index = loneMarkers.pop()!;
    let destination = index + 1;
    while (
      destination < state.tokens.length &&
      state.tokens[destination].type === 'underline_close'
    ) {
      destination += 1;
    }
    destination -= 1;
    if (index !== destination) {
      const token = state.tokens[destination];
      state.tokens[destination] = state.tokens[index];
      state.tokens[index] = token;
    }
  }
}

function underlinePostProcess(state: StateInline) {
  applyUnderlineDelimiters(state, state.delimiters);
  for (const meta of state.tokens_meta) {
    if (meta?.delimiters) applyUnderlineDelimiters(state, meta.delimiters);
  }
  return true;
}

function underlinePlugin(markdown: MarkdownIt) {
  markdown.inline.ruler.before('emphasis', 'underline', underlineTokenize);
  markdown.inline.ruler2.before('emphasis', 'underline', underlinePostProcess);
}

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
  .use(underlinePlugin)
  .use(texmath, {
  engine: katex,
  delimiters: 'dollars',
  // errorColor lands in an inline style, so a CSS variable keeps
  // malformed-TeX messages readable in both light and dark mode.
  katexOptions: { throwOnError: false, errorColor: 'var(--string-red)' },
  });

export function renderMarkdown(text: string): string {
  // 'nowheel' exempts an element from React Flow's pan-on-scroll, which
  // otherwise consumes wheel events; without it the overflow-x regions
  // (wide code lines, wide equations) could never actually scroll. Only
  // these two elements get it, so the rest of a card still pans the board.
  // Safe as string surgery: html:false escapes any user-typed markup, so
  // '<pre>' and the katex class attribute only ever come from the renderer.
  return md
    .render(text)
    .replace(/<pre>/g, '<pre class="nowheel">')
    .replace(/class="katex-display"/g, 'class="katex-display nowheel"');
}
