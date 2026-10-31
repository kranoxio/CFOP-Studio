import { describe, expect, it } from 'vitest';
import { progress } from '../src/progress';

describe('Spaced Repetition', () => {
  it('Intervalle wachsen bei "gut" und setzen bei "nochmal" zurück', () => {
    const id = 'TEST-1';
    const t0 = 1_000_000_000_000;
    expect(progress.isDue(id, t0)).toBe(true);
    progress.grade(id, 4, t0);
    expect(progress.get(id).interval).toBe(1);
    expect(progress.isDue(id, t0 + 3_600_000)).toBe(false);
    progress.grade(id, 4, t0);
    expect(progress.get(id).interval).toBe(3);
    progress.grade(id, 4, t0);
    expect(progress.get(id).interval).toBeGreaterThan(5);
    progress.grade(id, 1, t0);
    expect(progress.get(id).interval).toBe(0);
    expect(progress.isDue(id, t0 + 61_000)).toBe(true);
    expect(progress.get(id).ease!).toBeLessThan(2.5);
  });
});
