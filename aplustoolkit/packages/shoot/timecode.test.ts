import { describe, expect, it } from 'vitest';
import {
  dropFrameFrames,
  dropFrameLabel,
  formatTimecode,
  freeRunLabel,
  labelsPerDay,
  parseTimecode,
  timeOfDayLabel,
} from './timecode';

describe('formatTimecode', () => {
  it('writes HH:MM:SS:FF in the nominal base', () => {
    const label = ((1 * 60 + 54) * 60 + 58) * 25 + 19;
    expect(formatTimecode(label, '25')).toBe('01:54:58:19');
  });

  it('marks drop-frame with a semicolon', () => {
    expect(formatTimecode(0, '29.97df')).toBe('00:00:00;00');
  });

  it('wraps at midnight', () => {
    expect(formatTimecode(labelsPerDay('24') + 5, '24')).toBe('00:00:00:05');
  });
});

describe('parseTimecode', () => {
  it('reads separators and bare digits alike', () => {
    const expected = ((1 * 60 + 54) * 60 + 58) * 25 + 19;
    expect(parseTimecode('01:54:58:19', '25')).toBe(expected);
    expect(parseTimecode('1;54;58;19', '25')).toBe(expected);
    expect(parseTimecode('01545819', '25')).toBe(expected);
    expect(parseTimecode('1545819', '25')).toBe(expected);
  });

  it('refuses what is not a timecode at this rate', () => {
    expect(parseTimecode('25:00:00:00', '25')).toBeNull();
    expect(parseTimecode('00:00:00:25', '25')).toBeNull();
    expect(parseTimecode('00:00:00:29', '30')).not.toBeNull();
    expect(parseTimecode('hello', '25')).toBeNull();
  });

  it('moves a skipped drop-frame label to the first real one', () => {
    expect(formatTimecode(parseTimecode('00:01:00;00', '29.97df')!, '29.97df')).toBe('00:01:00;02');
    expect(formatTimecode(parseTimecode('00:10:00;00', '29.97df')!, '29.97df')).toBe('00:10:00;00');
  });
});

describe('drop-frame', () => {
  it('skips two labels at each minute but the tenth', () => {
    // Real frame 1800 is the first frame of minute one: labelled 00:01:00;02.
    expect(formatTimecode(dropFrameLabel(1800), '29.97df')).toBe('00:01:00;02');
    expect(formatTimecode(dropFrameLabel(1799), '29.97df')).toBe('00:00:59;29');
    // Ten minutes of real frames lands exactly on 00:10:00;00.
    expect(formatTimecode(dropFrameLabel(17982), '29.97df')).toBe('00:10:00;00');
  });

  it('round-trips', () => {
    for (const frames of [0, 1, 1799, 1800, 1801, 17981, 17982, 100_000, 2_589_407]) {
      expect(dropFrameFrames(dropFrameLabel(frames))).toBe(frames);
    }
  });

  it('keeps an hour of real time at one hour of labels', () => {
    const hourOfFrames = Math.round(3600 * (30000 / 1001));
    expect(formatTimecode(dropFrameLabel(hourOfFrames), '29.97df')).toBe('01:00:00;00');
  });
});

describe('timeOfDayLabel', () => {
  it('reads the clock at 25 fps', () => {
    const date = new Date(2026, 9, 31, 13, 4, 5, 520);
    expect(formatTimecode(timeOfDayLabel(date, '25'), '25')).toBe('13:04:05:13');
  });

  it('reads the clock at 23.976 by its labels, not its drift', () => {
    const date = new Date(2026, 9, 31, 23, 59, 59, 999);
    expect(formatTimecode(timeOfDayLabel(date, '23.976'), '23.976')).toBe('23:59:59:23');
  });
});

describe('freeRunLabel', () => {
  it('counts real frames from the jam', () => {
    const start = parseTimecode('01:00:00:00', '25')!;
    expect(formatTimecode(freeRunLabel(start, 1000, 1000 + 2_500, '25'), '25')).toBe('01:00:02:12');
  });

  it('never runs backwards past the jam', () => {
    expect(freeRunLabel(100, 5000, 1000, '25')).toBe(100);
  });
});
