export type Vec3 = [number, number, number];
export interface Field {
  position: Vec3;
  strength: number;
  radius: number;
  creation: number;
}
export interface Interaction {
  fields: Field[];
  active: boolean;
  expansion: number;
  birth?: { sequence: number; position: Vec3 };
}
export const emptyInteraction = (): Interaction => ({
  fields: [],
  active: false,
  expansion: 0,
});
export function acceleration(
  position: Vec3,
  fields: Field[],
  softening = 0.8,
): Vec3 {
  const result: Vec3 = [0, 0, 0];
  for (const field of fields) {
    const d = field.position.map((v, i) => v - position[i]);
    const scale =
      field.strength /
      Math.pow(
        d.reduce((s, v) => s + v * v, softening * softening),
        1.5,
      );
    d.forEach((v, i) => (result[i] += v * scale));
  }
  return result;
}
export function smooth(current: number, target: number, dt: number, rate = 9) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
export class FixedClock {
  private accumulator = 0;
  advance(dt: number, speed: number, step: (dt: number) => void) {
    this.accumulator += Math.min(dt, 0.05) * speed;
    let count = 0;
    while (this.accumulator >= 1 / 120 && count++ < 24) {
      step(1 / 120);
      this.accumulator -= 1 / 120;
    }
    if (count >= 24) this.accumulator = 0;
  }
}
