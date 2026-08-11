import { CARD_COLORS, TEXT_STYLES, type Card } from '../model/schema';
import { isTextCard } from '../model/schema';

/** Map a (possibly future/unknown) color token to a CSS class. */
export function colorClass(token: string): string {
  return (CARD_COLORS as readonly string[]).includes(token)
    ? `color-${token}`
    : 'color-paper';
}

/** Map a (possibly future/unknown) text style token to a CSS class. */
export function styleClass(card: Card): string {
  if (!isTextCard(card)) return '';
  return (TEXT_STYLES as readonly string[]).includes(card.style)
    ? `style-${card.style}`
    : 'style-note';
}

/** Map a forward-compatible alignment token without interpolating it into CSS. */
export function textAlignClass(card: Card): string {
  if (!isTextCard(card)) return '';
  switch (card.textAlign) {
    case 'center':
      return 'text-align-center';
    case 'right':
      return 'text-align-right';
    case 'justify':
      return 'text-align-justify';
    default:
      return 'text-align-left';
  }
}
