import { describe, expect, it } from 'vitest';
import { solvedState } from '../src/cube/cube';
import { parseAlg } from '../src/cube/notation';
import { MovePlayer, hermite, moveWeight } from '../src/render/MovePlayer';

describe('MovePlayer', () => {
  it('Hermite-Kurve beginnt bei 0 und endet bei 1', () => {
    for (const [a, b] of [[0, 0], [0.8, 0], [0, 0.8], [0.8, 0.8]]) {
      expect(hermite(0, a, b)).toBe(0);
      expect(hermite(1, a, b)).toBeCloseTo(1);
    }
  });

  it('Gesamtdauer stimmt exakt mit dem Tempo überein (auch fliessend)', () => {
    const moves = parseAlg("R U R' U' R' F R2 U' R' U' R U R' F'");
    const p = new MovePlayer();
    p.load(solvedState(), moves);
    p.tps = 5;
    p.play();
    const expected = moves.reduce((s, m) => s + moveWeight(m), 0) / p.tps;
    let t = 0;
    while (!p.finished && t < 100) {
      p.update(1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(expected - 1 / 30);
    expect(t).toBeLessThan(expected + 1 / 30);
  });

  it('Verkettete Züge stoppen nicht zwischendurch', () => {
    const p = new MovePlayer();
    p.load(solvedState(), parseAlg('R U R U'));
    p.tps = 2;
    p.play();
    // kurz vor Ende des ersten Zuges muss der Fortschritt noch merklich steigen
    for (let i = 0; i < 28; i++) p.update(1 / 60);
    const a = p.frame().progress;
    p.update(1 / 60);
    const b = p.frame().progress;
    expect(b - a).toBeGreaterThan(0.01);
  });
});
