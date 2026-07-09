import type { ReactNode } from 'react';
import type { Card } from '../../model/schema';
import { colorClass } from '../styleTokens';

interface CardChromeProps {
  card: Card;
  selected: boolean;
  editing?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Shared card shell: color token class, selection ring, editing state.
 * (The connection pin handle and NodeResizer land here in later
 * milestones so every card type gets them for free.)
 */
export function CardChrome({ card, selected, editing, className, children }: CardChromeProps) {
  const classes = [
    'card',
    `card-${card.type}`,
    colorClass(card.color),
    selected ? 'is-selected' : '',
    editing ? 'is-editing' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return <div className={classes}>{children}</div>;
}
