import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../markdown';

describe('trusted underline Markdown', () => {
  it('renders paired ++ markers as underline', () => {
    expect(renderMarkdown('++underlined++')).toContain('<u>underlined</u>');
  });

  it('keeps C++ and unmatched markers literal', () => {
    expect(renderMarkdown('C++ is not ++underlined')).not.toContain('<u>');
    expect(renderMarkdown('C++ is not ++underlined')).toContain('C++');
  });

  it('respects escaped markers and inline code', () => {
    expect(renderMarkdown('\\++literal++')).not.toContain('<u>');
    expect(renderMarkdown('`++code++`')).toContain('<code>++code++</code>');
  });

  it('keeps lone markers outside underlines for odd plus runs', () => {
    expect(renderMarkdown('+++three+++')).toBe('<p>+<u>three</u>+</p>\n');
    expect(renderMarkdown('++++four++++')).toBe('<p><u><u>four</u></u></p>\n');
    expect(renderMarkdown('+++++five+++++')).toBe('<p>+<u><u>five</u></u>+</p>\n');
  });

  it('renders escaped pluses inside an underline without changing the text', () => {
    expect(renderMarkdown('++C\\+\\+++')).toBe('<p><u>C++</u></p>\n');
  });

  it('does not reinterpret pluses inside links, code, or TeX', () => {
    expect(renderMarkdown('[C++](https://example.test/cpp)')).toContain('>C++</a>');
    expect(renderMarkdown('`a++b`')).toContain('<code>a++b</code>');
    expect(renderMarkdown('$a++b$')).not.toContain('<u>');
  });

  it('composes with emphasis and equations', () => {
    const html = renderMarkdown('++**force** is $F = ma$++');
    expect(html).toContain('<u><strong>force</strong> is ');
    expect(html).toContain('class="katex"');
    expect(html).toContain('</u>');
  });

  it('still escapes raw HTML', () => {
    const html = renderMarkdown('<u>unsafe</u><script>alert(1)</script>');
    expect(html).toContain('&lt;u&gt;unsafe&lt;/u&gt;');
    expect(html).not.toContain('<script>');
  });
});
