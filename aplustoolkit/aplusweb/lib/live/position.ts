export type Position = 'tl' | 'tc' | 'tr' | 'cl' | 'cc' | 'cr' | 'bl' | 'bc' | 'br';

export const POSITIONS: Position[] = ['tl', 'tc', 'tr', 'cl', 'cc', 'cr', 'bl', 'bc', 'br'];

export const isPosition = (value: string | undefined): value is Position => POSITIONS.includes(value as Position);
