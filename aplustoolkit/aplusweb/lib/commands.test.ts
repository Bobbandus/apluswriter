import { describe, expect, it } from 'vitest';
import { rankCommands, type Command } from './commands';

const make = (label: string, keywords?: string): Command => ({
  id: label,
  label,
  group: 'g',
  ...(keywords ? { keywords } : {}),
  run: () => {},
});

const LIST = [make('Exportera manus', 'pdf fdx html'), make('Inställningar'), make('Versioner'), make('1 INT. KÖK - DAG'), make('12 EXT. GATA - NATT')];
const labels = (query: string) => rankCommands(LIST, query).map((c) => c.label);

describe('command ranking', () => {
  it('lists everything in the given order when nothing is typed', () => {
    expect(labels('')).toEqual(LIST.map((c) => c.label));
    expect(labels('   ')).toHaveLength(LIST.length);
  });

  it('matches the start of a word, case-insensitively', () => {
    expect(labels('EXP')).toEqual(['Exportera manus']);
    expect(labels('manus')).toEqual(['Exportera manus']);
  });

  it('finds a command by a hidden keyword, but ranks a label match above it', () => {
    expect(labels('pdf')).toEqual(['Exportera manus']);
    const list = [make('Något annat', 'ver'), make('Versioner')];
    expect(rankCommands(list, 'ver').map((c) => c.label)).toEqual(['Versioner', 'Något annat']);
  });

  it('needs every word to match', () => {
    expect(labels('kök dag')).toEqual(['1 INT. KÖK - DAG']);
    expect(labels('kök natt')).toEqual([]);
  });

  it('jumps to a scene by its number, with the number first', () => {
    expect(labels('12')).toEqual(['12 EXT. GATA - NATT']);
    // "1" matches the start of both; the exact start of the label wins, then order.
    expect(labels('1')[0]).toBe('1 INT. KÖK - DAG');
  });

  it('keeps å, ä and ö', () => {
    expect(labels('inställ')).toEqual(['Inställningar']);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(labels('zzz')).toEqual([]);
  });
});
