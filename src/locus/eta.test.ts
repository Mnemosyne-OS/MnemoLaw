import { describe, it, expect } from 'vitest';
import { MIN_DONE, MIN_SECONDS, formatDuration, remainingSeconds } from './eta';

describe('remainingSeconds', () => {
  it('says nothing before the rate is measured', () => {
    // The first articles pay the embedder warm-up: a rate over 3 of them is a guess.
    expect(remainingSeconds(3, 2533, 2)).toBeNull();
    expect(remainingSeconds(MIN_DONE, 2533, MIN_SECONDS - 1)).toBeNull();
    expect(remainingSeconds(MIN_DONE - 1, 2533, 60)).toBeNull();
  });

  it('extrapolates the measured rate to what is left', () => {
    // 127 articles in 60 s -> 2406 left at 2.1167/s -> 1137 s.
    expect(remainingSeconds(127, 2533, 60)).toBe(1137);
  });

  it('has nothing to estimate once done, or on unreadable inputs', () => {
    expect(remainingSeconds(2533, 2533, 300)).toBeNull();
    expect(remainingSeconds(NaN, 2533, 300)).toBeNull();
    expect(remainingSeconds(100, NaN, 300)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('rounds to the nearest unit', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(95)).toBe('2 min');
    expect(formatDuration(1137)).toBe('19 min');
    expect(formatDuration(3900)).toBe('1 h 05');
  });
});
