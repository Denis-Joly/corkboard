import type { TextAlign } from '../model/schema';

export type SelectionDirection = 'forward' | 'backward' | 'none';

export interface TextTransformResult {
  value: string;
  editStart: number;
  editEnd: number;
  replacement: string;
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: SelectionDirection;
}

function markerRunFromStart(value: string, marker: string): number {
  let length = 0;
  while (value[length] === marker) length += 1;
  return length;
}

function markerRunBefore(value: string, index: number, marker: string): number {
  let length = 0;
  while (index - length - 1 >= 0 && value[index - length - 1] === marker) length += 1;
  return length;
}

function markerRunAfter(value: string, index: number, marker: string): number {
  let length = 0;
  while (index + length < value.length && value[index + length] === marker) length += 1;
  return length;
}

function markerIsPresent(run: number, marker: string): boolean {
  // One asterisk means italic; two mean bold; three mean both. This avoids
  // turning **bold** into *italic* when italic is applied to its inner text.
  return marker === '*' ? run % 2 === 1 : run >= marker.length;
}

function escapedContent(value: string, marker: string): string {
  // `++C++++++` is ambiguous to the delimiter parser. Escaping pluses
  // inside an underline keeps the selected text byte-for-byte on render.
  return marker === '++' ? value.replace(/(?<!\\)\+/g, '\\+') : value;
}

function unescapedContent(value: string, marker: string): string {
  return marker === '++' ? value.replace(/\\\+/g, '+') : value;
}

function result(
  value: string,
  editStart: number,
  editEnd: number,
  replacement: string,
  selectionStart: number,
  selectionEnd: number,
  selectionDirection: SelectionDirection,
): TextTransformResult {
  return {
    value: value.slice(0, editStart) + replacement + value.slice(editEnd),
    editStart,
    editEnd,
    replacement,
    selectionStart,
    selectionEnd,
    selectionDirection,
  };
}

/** Wrap the current selection in Markdown markers, or remove that same layer. */
export function wrapOrUnwrapSelection(
  value: string,
  rawStart: number,
  rawEnd: number,
  direction: SelectionDirection,
  open: string,
  close: string,
  placeholder = 'text',
): TextTransformResult {
  const start = Math.max(0, Math.min(rawStart, value.length));
  const end = Math.max(start, Math.min(rawEnd, value.length));
  const selected = value.slice(start, end);
  const marker = open[0] ?? '';
  const leading = selected.match(/^\s+/)?.[0] ?? '';
  const withoutLeading = selected.slice(leading.length);
  const trailing = withoutLeading.match(/\s+$/)?.[0] ?? '';
  const core = selected.slice(leading.length, selected.length - trailing.length);

  const selectedOpenRun = markerRunFromStart(core, marker);
  const selectedCloseRun = markerRunBefore(core, core.length, marker);
  if (
    core.length >= open.length + close.length &&
    markerIsPresent(selectedOpenRun, open) &&
    markerIsPresent(selectedCloseRun, close) &&
    core.startsWith(open) &&
    core.endsWith(close)
  ) {
    const inner = unescapedContent(
      core.slice(open.length, core.length - close.length),
      open,
    );
    const replacement = `${leading}${inner}${trailing}`;
    const selectionStart = start + leading.length;
    return result(
      value,
      start,
      end,
      replacement,
      selectionStart,
      selectionStart + inner.length,
      direction,
    );
  }

  const beforeRun = markerRunBefore(value, start, marker);
  const afterRun = markerRunAfter(value, end, marker);
  if (
    start >= open.length &&
    markerIsPresent(beforeRun, open) &&
    markerIsPresent(afterRun, close) &&
    value.slice(start - open.length, start) === open &&
    value.slice(end, end + close.length) === close
  ) {
    const editStart = start - open.length;
    const inner = unescapedContent(selected, open);
    return result(
      value,
      editStart,
      end + close.length,
      inner,
      editStart,
      editStart + inner.length,
      direction,
    );
  }

  const content = escapedContent(core || placeholder, open);
  const replacement = `${leading}${open}${content}${close}${trailing}`;
  const selectionStart = start + leading.length + open.length;
  return result(
    value,
    start,
    end,
    replacement,
    selectionStart,
    selectionStart + content.length,
    selected ? direction : 'none',
  );
}

/** Unknown forward-compatible values deliberately fall back to left. */
export function resolveTextAlign(value: string | undefined): TextAlign {
  switch (value) {
    case 'center':
    case 'right':
    case 'justify':
      return value;
    default:
      return 'left';
  }
}
