import { describe, it, expect } from "vitest";
import { BodySystem } from "../../src/physics/BodySystem";
import { OrbitalEvents } from "../../src/events/OrbitalEvents";
import { CreationHold } from "../../src/gestures/Hands";

describe("mutual gravitational dynamics", () => {
  it("keeps a softened circular binary bound while conserving energy and momentum", () => {
    const system = new BodySystem();
    system.load("binary");
    const initial = system.energy();
    let largestError = 0;
    for (let i = 0; i < 24000; i++) {
      system.step(1 / 120);
      if (i % 120 === 0)
        largestError = Math.max(
          largestError,
          Math.abs((system.energy() - initial) / initial),
        );
    }
    expect(largestError).toBeLessThan(0.001);
    expect(Math.hypot(...system.centerOfMass().position)).toBeLessThan(1e-8);
    expect(Math.hypot(...system.centerOfMass().velocity)).toBeLessThan(1e-8);
    const [a, b] = system.bodies;
    expect(
      Math.hypot(...a.position.map((v, i) => v - b.position[i])),
    ).toBeCloseTo(14, 2);
  });
  it("evolves three bodies in depth without freezing, teleporting or becoming nonfinite", () => {
    const system = new BodySystem();
    system.load("three-body");
    const before = system.bodies.map((b) => [...b.position]);
    for (let i = 0; i < 12000; i++) system.step(1 / 120);
    expect(system.bodies).toHaveLength(3);
    expect(
      system.bodies
        .flatMap((b) => [...b.position, ...b.velocity])
        .every(Number.isFinite),
    ).toBe(true);
    expect(system.bodies.map((b) => b.position)).not.toEqual(before);
    expect(Math.hypot(...system.centerOfMass().velocity)).toBeLessThan(1e-8);
  });
  it("transfers kinetic energy in a real moving-star encounter and reports it only on departure", () => {
    const system = new BodySystem();
    const events = new OrbitalEvents();
    system.load("slingshot");
    const initial = system.energy();
    let event: { label: string; gain: number } | null = null;
    expect(events.status(system.time)).toBeNull();
    for (let i = 0; i < 2400; i++) {
      system.step(1 / 120);
      events.update(system);
      const current = events.status(system.time);
      if (current?.gain) event = current;
    }
    expect(event?.label).toBe("Gravitational slingshot");
    expect(event!.gain).toBeGreaterThan(0.15);
    expect(Math.abs((system.energy() - initial) / initial)).toBeLessThan(0.01);
  });
  it("caps star creation and lets external fields change velocity without snapping position", () => {
    const system = new BodySystem();
    const star = system.addStar([0, 0, 0])!;
    system.step(1 / 120, [
      { position: [8, 0, 0], strength: 30, radius: 8, creation: 0 },
    ]);
    expect(star.velocity[0]).toBeGreaterThan(0);
    expect(star.position[0]).toBeLessThan(0.01);
    const position = [...star.position];
    system.step(0);
    expect(star.position).toEqual(position);
    system.addStar([10, 0, 0]);
    system.addStar([-10, 0, 0]);
    expect(system.addStar([0, 10, 0])).toBeNull();
    expect(system.starCount).toBe(3);
    expect(system.fields()).toHaveLength(3);
    system.clear();
    expect(system.fields()).toEqual([]);
  });
  it("requires a sustained pinch and a release before the next star", () => {
    const hold = new CreationHold();
    expect(hold.update(0.9, 0)).toBe(false);
    expect(hold.update(0.9, 900)).toBe(false);
    expect(hold.update(0.9, 1200)).toBe(true);
    expect(hold.update(0.9, 3000)).toBe(false);
    hold.reset();
    expect(hold.update(0.9, 4000)).toBe(false);
    expect(hold.update(0.3, 4400)).toBe(false);
    expect(hold.update(0.9, 5000)).toBe(false);
    expect(hold.update(0.9, 6200)).toBe(true);
  });
});
