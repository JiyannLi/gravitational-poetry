import { describe, it, expect } from "vitest";
import { acceleration, FixedClock, smooth } from "../../src/physics/field";
import { GestureLatch } from "../../src/gestures/Hands";
import { CosmicEvents } from "../../src/events/CosmicEvents";
describe("physical control contract", () => {
  it("attracts towards the field and stays finite at its center", () => {
    const fields = [
      {
        position: [0, 0, 0] as [number, number, number],
        strength: 10,
        radius: 8,
        creation: 0,
      },
    ];
    expect(acceleration([2, 0, 0], fields)[0]).toBeLessThan(0);
    expect(acceleration([0, 0, 0], fields)).toEqual([0, 0, 0]);
  });
  it("decays control smoothly after tracking loss independent of frame rate", () => {
    let a = 30,
      b = 30;
    for (let i = 0; i < 60; i++) a = smooth(a, 0, 1 / 60);
    for (let i = 0; i < 30; i++) b = smooth(b, 0, 1 / 30);
    expect(a).toBeCloseTo(b, 8);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(0.01);
  });
  it("pause freezes integration and time scale changes simulation steps", () => {
    const clock = new FixedClock();
    let count = 0;
    clock.advance(0.05, 0, () => count++);
    expect(count).toBe(0);
    clock.advance(0.05, 1, () => count++);
    expect(count).toBe(6);
  });
  it("rejects single-frame fist flicker and holds hysteresis", () => {
    const latch = new GestureLatch();
    expect(latch.update(0.9, 0)).toBe(false);
    expect(latch.update(0.1, 60)).toBe(false);
    expect(latch.update(0.9, 100)).toBe(false);
    expect(latch.update(0.9, 260)).toBe(true);
    expect(latch.update(0.5, 300)).toBe(true);
    expect(latch.update(0.1, 350)).toBe(true);
    expect(latch.update(0.1, 510)).toBe(false);
  });
  it("enforces event lifecycle and cooldown", () => {
    const events = new CosmicEvents([
      {
        id: "collapse",
        priority: 1,
        duration: 2,
        cooldown: 10,
        condition: (e) => e > 5,
      },
    ]);
    expect(events.update(0, 1)).toBeNull();
    expect(events.update(1, 8)).toBe("collapse");
    expect(events.update(4, 8)).toBeNull();
    expect(events.update(12, 8)).toBe("collapse");
  });
});
