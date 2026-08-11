import { describe, expect, it } from 'vitest';
import { resolveTextAlign, wrapOrUnwrapSelection } from '../textFormatting';

describe('wrapOrUnwrapSelection', () => {
  it('wraps selected text and keeps it selected', () => {
    const transformed = wrapOrUnwrapSelection('hello world', 6, 11, 'forward', '**', '**');
    expect(transformed.value).toBe('hello **world**');
    expect(transformed.selectionStart).toBe(8);
    expect(transformed.selectionEnd).toBe(13);
    expect(transformed.selectionDirection).toBe('forward');
  });

  it('inserts and selects a placeholder for a collapsed caret', () => {
    const transformed = wrapOrUnwrapSelection('hello ', 6, 6, 'none', '++', '++');
    expect(transformed.value).toBe('hello ++text++');
    expect(transformed.selectionStart).toBe(8);
    expect(transformed.selectionEnd).toBe(12);
  });

  it('unwraps markers surrounding a selected inner value', () => {
    const transformed = wrapOrUnwrapSelection('**hello**', 2, 7, 'backward', '**', '**');
    expect(transformed.value).toBe('hello');
    expect(transformed.selectionStart).toBe(0);
    expect(transformed.selectionEnd).toBe(5);
    expect(transformed.selectionDirection).toBe('backward');
  });

  it('unwraps when the selection includes its markers', () => {
    const transformed = wrapOrUnwrapSelection('say ++hello++', 4, 13, 'forward', '++', '++');
    expect(transformed.value).toBe('say hello');
    expect(transformed.selectionStart).toBe(4);
    expect(transformed.selectionEnd).toBe(9);
  });

  it('nests italic inside bold instead of mistaking bold markers for italic', () => {
    const transformed = wrapOrUnwrapSelection('**bold**', 2, 6, 'forward', '*', '*');
    expect(transformed.value).toBe('***bold***');

    const toggledOff = wrapOrUnwrapSelection(transformed.value, 3, 7, 'forward', '*', '*');
    expect(toggledOff.value).toBe('**bold**');
  });

  it('leaves surrounding Markdown, newlines, and emoji untouched', () => {
    const source = '# Idea\n🧪 result';
    const start = source.indexOf('result');
    const transformed = wrapOrUnwrapSelection(source, start, source.length, 'forward', '++', '++');
    expect(transformed.value).toBe('# Idea\n🧪 ++result++');
  });

  it('keeps leading and trailing whitespace outside Markdown markers', () => {
    const transformed = wrapOrUnwrapSelection('before  hello \nafter', 7, 14, 'backward', '**', '**');
    expect(transformed.value).toBe('before  **hello** \nafter');
    expect(transformed.selectionStart).toBe(10);
    expect(transformed.selectionEnd).toBe(15);
    expect(transformed.selectionDirection).toBe('backward');
  });

  it('preserves all-whitespace selections before the inserted placeholder', () => {
    const transformed = wrapOrUnwrapSelection('before \t', 6, 8, 'forward', '*', '*');
    expect(transformed.value).toBe('before \t*text*');
    expect(transformed.value.slice(transformed.selectionStart, transformed.selectionEnd)).toBe('text');
  });

  it('escapes pluses inside underline markers and restores them when toggled off', () => {
    const wrapped = wrapOrUnwrapSelection('C++', 0, 3, 'forward', '++', '++');
    expect(wrapped.value).toBe('++C\\+\\+++');
    const unwrapped = wrapOrUnwrapSelection(
      wrapped.value,
      wrapped.selectionStart,
      wrapped.selectionEnd,
      'forward',
      '++',
      '++',
    );
    expect(unwrapped.value).toBe('C++');
  });

  it('wraps equation selections with dollar delimiters', () => {
    const transformed = wrapOrUnwrapSelection('Energy mc^2', 7, 11, 'forward', '$', '$', 'equation');
    expect(transformed.value).toBe('Energy $mc^2$');
  });
});

describe('resolveTextAlign', () => {
  it('accepts supported values and safely falls back for future tokens', () => {
    expect(resolveTextAlign('center')).toBe('center');
    expect(resolveTextAlign('justify')).toBe('justify');
    expect(resolveTextAlign('future-diagonal')).toBe('left');
    expect(resolveTextAlign(undefined)).toBe('left');
  });
});
