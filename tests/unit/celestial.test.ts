import { expect, it } from "vitest";
import {
  celestialGeometry,
  CelestialParticle,
} from "../../src/particles/CelestialParticle";
it("samples a bounded uniform shell, sparse volume and separated tilted ring", () => {
  const g = celestialGeometry(4096),
    p = g.getAttribute("position"),
    r = g.getAttribute("ring"),
    data = g.getAttribute("particle");
  const bins = Array(10).fill(0);
  let inner = 0,
    dust = 0;
  for (let i = 0; i < p.count; i++) {
    const len = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
    if (data.getX(i) === 0) {
      expect(len).toBeGreaterThan(0.98);
      expect(len).toBeLessThan(1.02);
      bins[Math.min(9, Math.floor((p.getY(i) / len + 1) * 5))]++;
    } else if (data.getX(i) === 1) {
      inner++;
      expect(len).toBeLessThan(1);
    } else {
      dust++;
      expect(Math.hypot(r.getX(i), r.getY(i), r.getZ(i))).toBeGreaterThan(1.6);
    }
  }
  expect(Math.max(...bins) - Math.min(...bins)).toBeLessThan(3);
  expect(inner / p.count).toBeCloseTo(0.12, 2);
  expect(dust / p.count).toBeCloseTo(0.18, 2);
  g.dispose();
});
it("morphs continuously with the same response at 30/60/120 Hz, without rewriting vertex buffers", () => {
  const g = celestialGeometry(512);
  const values = [];
  for (const hz of [30, 60, 120]) {
    const body = new CelestialParticle(g, "#aabbff", 2);
    body.shape = "ring";
    body.update(0, 0, 1);
    expect(body.points.material.uniforms.ringMix.value).toBe(0);
    for (let i = 0; i < hz / 2; i++) body.update(i / hz, 1 / hz, 1);
    values.push(body.points.material.uniforms.ringMix.value);
    expect(body.points.material.uniforms.ringMix.value).toBeGreaterThan(0.99);
    const before = body.points.material.uniforms.ringMix.value;
    body.shape = "nebula";
    body.update(1, 1 / hz, 1);
    expect(body.points.material.uniforms.ringMix.value).toBeLessThan(before);
    expect(body.points.material.uniforms.ringMix.value).toBeGreaterThan(0);
    expect(g.getAttribute("position").version).toBe(0);
    body.dispose();
  }
  expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1e-9);
  g.dispose();
});
