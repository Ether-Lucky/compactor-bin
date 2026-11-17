// Runs the spec's automatic acceptance scenarios (SPEC.md §7–8) and core checks in Node.
// The site itself never needs this: `npm install` then `npm test` is only for developers.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const src = readFileSync(new URL('../data/parts.js', import.meta.url), 'utf8');
const PARTS = JSON.parse(src.slice(src.indexOf('= {') + 2, src.lastIndexOf('}') + 1));
const CB = require('../js/core.js');
require('../js/tests.js');

describe('parts table', () => {
  it('is strict JSON readable by the Blender script', () => {
    expect(PARTS.geometry.chamber_h.v).toBeGreaterThan(0);
    expect(Object.keys(PARTS.items)).toContain('pet500');
  });
});

describe('seeded randomness (R-A2)', () => {
  it('same seed gives the same run', () => {
    const run = () => { const s = CB.createSim(PARTS, { seed: 42 }); s.insert('handHeld'); s.run(5); return s.events.map(e => e.code).join(); };
    expect(run()).toBe(run());
  });
});

describe('acceptance scenarios', () => {
  for (const sc of CB.SCENARIOS.filter(s => s.auto)) {
    it(`${sc.id} ${sc.title}`, () => {
      const r = CB.runScenario(PARTS, sc);
      expect(r.pass, r.detail).toBe(true);
    });
  }
});
