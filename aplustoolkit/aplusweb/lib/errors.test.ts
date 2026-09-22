import { describe, expect, it } from 'vitest';
import { describeError } from './errors';

describe('describeError', () => {
  it('reads a real Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  /* This is the one that matters: a Supabase PostgrestError is a plain
     object, not an Error, and used to collapse to "[object Object]". */
  it('reads a Supabase-shaped error that is not an Error instance', () => {
    expect(describeError({ message: 'not allowed to invite to this project', code: '42501', details: null, hint: null })).toBe(
      'not allowed to invite to this project',
    );
  });

  it('appends the hint when there is one', () => {
    expect(describeError({ message: 'permission denied', hint: 'check your role' })).toBe('permission denied (check your role)');
  });

  it('reads a plain string', () => {
    expect(describeError('offline')).toBe('offline');
  });

  it('never returns "[object Object]"', () => {
    expect(describeError({ weird: true })).not.toBe('[object Object]');
    expect(describeError(null)).not.toBe('[object Object]');
    expect(describeError(undefined)).not.toBe('[object Object]');
  });
});
