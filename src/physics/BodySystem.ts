import { CONFIG } from "../config/universe";
import { acceleration, type Field, type Vec3 } from "./field";

export type OrbitPreset = "binary" | "three-body" | "slingshot";
export interface CelestialBody {
  id: number;
  kind: "star" | "probe";
  mass: number;
  position: Vec3;
  velocity: Vec3;
  radius: number;
  color: string;
}
export const BODY_CONFIG = {
  maxStars: 3,
  maxBodies: 4,
  minMass: 8,
  maxMass: 40,
  defaultMass: 24,
  trailLength: 384,
  trailInterval: 0.05,
  encounterRadius: 9,
  colors: ["#ffd59a", "#8bd8ff", "#b39aff"],
};
const copy = (v: Vec3): Vec3 => [...v];
/** Dimensionless, softened Newtonian N-body dynamics. No UI/render dependencies. */
export class BodySystem {
  readonly bodies: CelestialBody[] = [];
  time = 0;
  private nextId = 0;
  get starCount() {
    return this.bodies.filter((body) => body.kind === "star").length;
  }
  clear() {
    this.bodies.length = 0;
    this.time = 0;
  }
  private create(
    position: Vec3,
    velocity: Vec3,
    mass: number,
    kind: CelestialBody["kind"] = "star",
  ) {
    const body: CelestialBody = {
      id: this.nextId++,
      kind,
      mass,
      position: copy(position),
      velocity: copy(velocity),
      radius: kind === "probe" ? 0.15 : 0.25 + Math.cbrt(mass) * 0.19,
      color:
        kind === "probe" ? "#e8f0ff" : BODY_CONFIG.colors[this.starCount % 3],
    };
    this.bodies.push(body);
    return body;
  }
  addStar(position: Vec3, mass = BODY_CONFIG.defaultMass) {
    if (
      this.starCount >= BODY_CONFIG.maxStars ||
      !position.every(Number.isFinite) ||
      !Number.isFinite(mass)
    )
      return null;
    mass = Math.max(BODY_CONFIG.minMass, Math.min(BODY_CONFIG.maxMass, mass));
    const center = this.centerOfMass();
    const d: Vec3 = position.map((v, i) => v - center.position[i]) as Vec3;
    const r = Math.hypot(...d);
    const speed =
      center.mass > 0 && r > 0.1
        ? Math.sqrt(
            (CONFIG.gravity * center.mass * r * r) /
              Math.pow(r * r + CONFIG.softening ** 2, 1.5),
          )
        : 0;
    const planar = Math.hypot(d[0], d[1]);
    const velocity: Vec3 = copy(center.velocity);
    if (planar > 0.1) {
      velocity[0] -= (d[1] / planar) * speed;
      velocity[1] += (d[0] / planar) * speed;
    }
    return this.create(position, velocity, mass);
  }
  load(preset: OrbitPreset) {
    this.clear();
    if (preset === "slingshot") {
      // A moving star and an unbound probe. Gravity, not an impulse or animation,
      // turns the trajectory and transfers kinetic energy in the observer frame.
      this.create([0, 0, 0], [0, 1.6, 0], 20);
      this.create([-18, -3, 0.2], [7, 1.6, 0], 0.02, "probe");
      return;
    }
    const r = 7,
      mass = BODY_CONFIG.defaultMass;
    const v = Math.sqrt(
      (CONFIG.gravity * mass * 2 * r * r) /
        Math.pow(4 * r * r + CONFIG.softening ** 2, 1.5),
    );
    this.create([-r, 0, 0], [0, -v, 0], mass);
    this.create([r, 0, 0], [0, v, 0], mass);
    if (preset === "three-body") {
      this.create([0, 10, 2], [-1.7, -0.7, -0.3], 18);
      // Center the initial state without subsequently constraining any trajectory.
      const center = this.centerOfMass();
      for (const body of this.bodies)
        for (let axis = 0; axis < 3; axis++) {
          body.position[axis] -= center.position[axis];
          body.velocity[axis] -= center.velocity[axis];
        }
    }
  }
  private forces(fields: Field[]): Vec3[] {
    const result = this.bodies.map((body) =>
      acceleration(body.position, fields, CONFIG.softening),
    );
    for (let i = 0; i < this.bodies.length; i++)
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i],
          b = this.bodies[j];
        const d = b.position.map((v, axis) => v - a.position[axis]);
        const scale =
          CONFIG.gravity /
          Math.pow(
            d.reduce((sum, v) => sum + v * v, CONFIG.softening ** 2),
            1.5,
          );
        for (let axis = 0; axis < 3; axis++) {
          result[i][axis] += d[axis] * scale * b.mass;
          result[j][axis] -= d[axis] * scale * a.mass;
        }
      }
    return result;
  }
  step(dt: number, fields: Field[] = []) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const before = this.forces(fields);
    for (let i = 0; i < this.bodies.length; i++)
      for (let axis = 0; axis < 3; axis++)
        this.bodies[i].position[axis] +=
          this.bodies[i].velocity[axis] * dt + 0.5 * before[i][axis] * dt * dt;
    const after = this.forces(fields);
    for (let i = 0; i < this.bodies.length; i++)
      for (let axis = 0; axis < 3; axis++)
        this.bodies[i].velocity[axis] +=
          0.5 * (before[i][axis] + after[i][axis]) * dt;
    this.time += dt;
  }
  fields(): Field[] {
    return this.bodies.map((body) => ({
      position: body.position,
      strength: CONFIG.gravity * body.mass,
      radius: 8,
      creation: 0,
    }));
  }
  centerOfMass() {
    const mass = this.bodies.reduce((sum, b) => sum + b.mass, 0);
    const position: Vec3 = [0, 0, 0],
      velocity: Vec3 = [0, 0, 0];
    for (const body of this.bodies)
      for (let axis = 0; axis < 3; axis++) {
        position[axis] += (body.position[axis] * body.mass) / mass;
        velocity[axis] += (body.velocity[axis] * body.mass) / mass;
      }
    return { mass, position, velocity };
  }
  energy() {
    let energy = this.bodies.reduce(
      (sum, b) =>
        sum + 0.5 * b.mass * b.velocity.reduce((s, v) => s + v * v, 0),
      0,
    );
    for (let i = 0; i < this.bodies.length; i++)
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i],
          b = this.bodies[j];
        const r = Math.sqrt(
          a.position.reduce(
            (sum, v, axis) => sum + (v - b.position[axis]) ** 2,
            CONFIG.softening ** 2,
          ),
        );
        energy -= (CONFIG.gravity * a.mass * b.mass) / r;
      }
    return energy;
  }
}
