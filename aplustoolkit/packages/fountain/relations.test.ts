import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { relations } from './relations';

const SCRIPT = [
  'INT. KÖK - DAG',
  '',
  'ERIK',
  'Hej på dig, hur är läget idag?',
  '',
  'VILDE',
  'Bra.',
  '',
  'EXT. GATA - NATT',
  '',
  'ERIK',
  'Det regnar.',
  '',
  'VILDE',
  'Jaså.',
  '',
  'NOAH',
  'Tyst.',
  '',
  'INT. BIL - NATT',
  '',
  'NOAH',
  'Kör.',
  '',
  'VILDE',
  'Nej.',
  '',
].join('\n');

const of = (source: string, limit?: number) => relations(parse(source).characters, limit);

describe('relations', () => {
  it('connects two characters by the scenes they share', () => {
    const { edges } = of(SCRIPT);
    const between = (a: string, b: string) =>
      edges.find((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a))?.scenes;

    expect(between('ERIK', 'VILDE')).toBe(2); // kitchen and street
    expect(between('VILDE', 'NOAH')).toBe(2); // street and car
    expect(between('ERIK', 'NOAH')).toBe(1); // street only
  });

  it('draws each pair once, never twice and never to itself', () => {
    const { edges, nodes } = of(SCRIPT);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(3);
    for (const edge of edges) expect(edge.a).not.toBe(edge.b);
    const keys = edges.map((edge) => [edge.a, edge.b].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('leaves out a pair who never share a scene', () => {
    const { edges } = of('INT. A - DAG\n\nERIK\nHej.\n\nINT. B - DAG\n\nVILDE\nHej.');
    expect(edges).toEqual([]);
  });

  it('ranks by words spoken, so the picture is of who carries the script', () => {
    const { nodes } = of(SCRIPT);
    expect(nodes[0]?.name).toBe('ERIK');
    expect(nodes.map((node) => node.words)).toEqual([...nodes.map((node) => node.words)].sort((a, b) => b - a));
  });

  it('keeps only the busiest characters and says how many it left out', () => {
    const many = Array.from({ length: 6 }, (_, i) => `INT. S${i} - DAG\n\nROLL${i}\n${'ord '.repeat(10 - i)}`).join('\n\n');
    const result = of(many, 4);
    expect(result.nodes).toHaveLength(4);
    expect(result.omitted).toBe(2);
    expect(result.nodes.map((node) => node.name)).toEqual(['ROLL0', 'ROLL1', 'ROLL2', 'ROLL3']);
  });

  it('orders the strongest connection first', () => {
    const { edges } = of(SCRIPT);
    expect(edges.map((edge) => edge.scenes)).toEqual([...edges.map((edge) => edge.scenes)].sort((a, b) => b - a));
  });

  it('gives nothing for a script nobody speaks in', () => {
    expect(of('INT. TOMT - DAG\n\nIngenting händer.')).toEqual({ nodes: [], edges: [], omitted: 0 });
  });
});
