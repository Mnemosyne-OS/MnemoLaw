// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClock } from './useClock';

afterEach(() => { vi.useRealTimers(); });

describe('useClock', () => {
  it('keeps ticking while progress re-renders the caller every 100 ms', () => {
    // The field bug: the clock was keyed on an object replaced at every
    // progress event, so it reset before its first tick and read "0 s".
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result, rerender } = renderHook(({ running, n }) => { void n; return useClock(running); },
      { initialProps: { running: true, n: 0 } });
    for (let n = 1; n <= 30; n++) {
      act(() => { vi.advanceTimersByTime(100); });
      rerender({ running: true, n });
    }
    expect(result.current).toBeGreaterThanOrEqual(2000);
  });

  it('stops when nothing runs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() => useClock(false));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(0);
  });
});
