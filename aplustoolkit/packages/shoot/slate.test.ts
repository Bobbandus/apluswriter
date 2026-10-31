import { describe, expect, it } from 'vitest';
import { changeRate, clap, defaultSlate, edit, logAsText, normalizeSlate, open, slateDate, LOG_LIMIT } from './slate';

describe('clap and open', () => {
  it('freezes on the clap and logs it', () => {
    const s = clap({ ...defaultSlate(), scene: '35A', take: 3 }, '01:54:58:19', 1000);
    expect(s.closed).toBe(true);
    expect(s.frozenTc).toBe('01:54:58:19');
    expect(s.log[0]).toMatchObject({ tc: '01:54:58:19', scene: '35A', take: 3 });
  });

  it('ignores a second clap while shut', () => {
    const once = clap(defaultSlate(), '00:00:01:00', 1);
    expect(clap(once, '00:00:02:00', 2)).toBe(once);
  });

  it('counts the take up when the sticks open after a clap', () => {
    const s = open(clap(defaultSlate(), 'x', 1));
    expect(s.closed).toBe(false);
    expect(s.frozenTc).toBeNull();
    expect(s.take).toBe(2);
  });

  it('leaves the take alone when counting up is off', () => {
    expect(open(clap({ ...defaultSlate(), autoTake: false }, 'x', 1)).take).toBe(1);
  });

  it('does not count up twice when the take was set by hand after the clap', () => {
    const clapped = clap({ ...defaultSlate(), take: 4 }, 'x', 1);
    const fixed = edit(clapped, { scene: '36', take: 1 });
    expect(open(fixed).take).toBe(1);
  });

  it('still counts up after editing something that is not roll, scene or take', () => {
    const clapped = clap(defaultSlate(), 'x', 1);
    expect(open(edit(clapped, { note: 'MOS' })).take).toBe(2);
  });
});

describe('edit', () => {
  it('keeps the take a positive whole number', () => {
    expect(edit(defaultSlate(), { take: 0 }).take).toBe(1);
    expect(edit(defaultSlate(), { take: 7.8 }).take).toBe(7);
  });
});

describe('changeRate', () => {
  it('keeps a free-running clock where it was', () => {
    const s = { ...defaultSlate(), tcMode: 'jam' as const, rate: '25' as const, jam: { label: 3600 * 25, at: 0 } };
    const patch = changeRate(s, '30', 0);
    expect(patch).toEqual({ rate: '30', jam: { label: 3600 * 30, at: 0 } });
  });

  it('only changes the rate for time of day', () => {
    expect(changeRate(defaultSlate(), '24', 0)).toEqual({ rate: '24' });
  });
});

describe('normalizeSlate', () => {
  it('falls back to defaults for junk', () => {
    expect(normalizeSlate(null)).toEqual(defaultSlate());
    expect(normalizeSlate({ rate: '17', take: 'many', tcMode: 'banana' })).toMatchObject({ rate: '25', take: 1, tcMode: 'tod' });
  });

  it('keeps what is good', () => {
    const s = normalizeSlate({ scene: '35A', rate: '29.97df', jam: { label: 10, at: 20 }, labels: { dop: 'FOTO' } });
    expect(s.scene).toBe('35A');
    expect(s.rate).toBe('29.97df');
    expect(s.jam).toEqual({ label: 10, at: 20 });
    expect(s.labels.dop).toBe('FOTO');
    expect(s.labels.roll).toBe('ROLL');
  });

  it('never leaves the slate shut without a frozen reading', () => {
    expect(normalizeSlate({ closed: true }).closed).toBe(false);
  });

  it('caps the log', () => {
    const log = Array.from({ length: LOG_LIMIT + 10 }, (_, i) => ({ at: i, tc: 't' }));
    expect(normalizeSlate({ log }).log).toHaveLength(LOG_LIMIT);
  });
});

describe('text', () => {
  it('writes the date the slate way', () => {
    expect(slateDate(new Date(2022, 11, 11))).toBe('11 / 12 / 22');
  });

  it('writes the log oldest first, tab-separated', () => {
    let s = clap({ ...defaultSlate(), scene: '1' }, 'A', new Date(2026, 0, 1, 10).getTime());
    s = clap(open(s), 'B', new Date(2026, 0, 1, 11).getTime());
    const lines = logAsText(s.log).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]?.startsWith('A\tA001\t1\t1')).toBe(true);
    expect(lines[2]?.startsWith('B\tA001\t1\t2')).toBe(true);
  });
});
