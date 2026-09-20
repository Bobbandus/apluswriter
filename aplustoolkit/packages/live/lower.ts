import type { LowerItem, LowerState } from './types';

/**
 * Lower thirds: a queue of names to show one at a time. The same queue is what a show with many acts needs
 * (one entry per artist), so "next" is the button that matters most.
 */

export const defaultLower = (): LowerState => ({
  items: [{ title: 'Namn Namnsson', subtitle: 'Titel eller plats' }],
  index: 0,
  visible: false,
});

export type LowerAction =
  | { type: 'show'; index?: number }
  | { type: 'hide' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'add'; item: LowerItem }
  | { type: 'update'; index: number; item: LowerItem }
  | { type: 'remove'; index: number };

const MAX_ITEMS = 200;
const clean = (item: LowerItem): LowerItem => ({
  title: item.title.replace(/\s+/g, ' ').trim().slice(0, 80),
  subtitle: item.subtitle.replace(/\s+/g, ' ').trim().slice(0, 120),
});
const inRange = (state: LowerState, index: number) => Number.isInteger(index) && index >= 0 && index < state.items.length;

export function applyLower(state: LowerState, action: LowerAction): LowerState {
  switch (action.type) {
    case 'show': {
      const index = action.index ?? state.index;
      return inRange(state, index) ? { ...state, index, visible: true } : state;
    }
    case 'hide':
      return { ...state, visible: false };
    // Next and previous stop at the ends instead of wrapping: a wrong wrap on air is worse than a dead button.
    case 'next':
      return state.index + 1 < state.items.length ? { ...state, index: state.index + 1, visible: true } : state;
    case 'prev':
      return state.index > 0 ? { ...state, index: state.index - 1, visible: true } : state;
    case 'add':
      return state.items.length >= MAX_ITEMS ? state : { ...state, items: [...state.items, clean(action.item)] };
    case 'update':
      return inRange(state, action.index) ? { ...state, items: state.items.map((item, i) => (i === action.index ? clean(action.item) : item)) } : state;
    case 'remove': {
      if (!inRange(state, action.index)) return state;
      const items = state.items.filter((_, i) => i !== action.index);
      // Removing what is on air takes it down; removing anything before it keeps the same one up.
      const index = Math.max(0, Math.min(items.length - 1, action.index < state.index ? state.index - 1 : state.index));
      return { items, index, visible: action.index === state.index ? false : state.visible };
    }
    default:
      return state;
  }
}
