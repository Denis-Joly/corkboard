/**
 * Text-card content is Markdown source (plain string, per model/schema.ts).
 * html:false keeps literal '<' / '>' in notes as escaped text rather than
 * interpreted tags — there's no trusted/untrusted boundary here since it's
 * the user's own local content, but there's also no reason to parse HTML.
 */
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
}).use(texmath, {
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
