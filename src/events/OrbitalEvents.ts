import { BODY_CONFIG, type BodySystem } from "../physics/BodySystem";
interface Encounter {
  probe: number;
  star: number;
  entrySpeed: number;
  closest: number;
}
/** Observe real approach/departure at the same radius; never prescribe a path. */
export class OrbitalEvents {
  private encounter: Encounter | null = null;
  private cooldownUntil = 0;
  private activeUntil = 0;
  private gain = 0;
  reset() {
    this.encounter = null;
    this.cooldownUntil = 0;
    this.activeUntil = 0;
    this.gain = 0;
  }
  update(system: BodySystem) {
    const probe = system.bodies.find((b) => b.kind === "probe");
    if (!probe) {
      this.encounter = null;
      return;
    }
    const stars = system.bodies.filter((b) => b.kind === "star");
    if (!this.encounter && system.time >= this.cooldownUntil) {
      for (const star of stars) {
        const d = probe.position.map((v, i) => v - star.position[i]);
        const distance = Math.hypot(...d);
        const radial = d.reduce(
          (sum, v, i) => sum + v * (probe.velocity[i] - star.velocity[i]),
          0,
        );
        if (distance <= BODY_CONFIG.encounterRadius && radial < 0) {
          this.encounter = {
            probe: probe.id,
            star: star.id,
            entrySpeed: Math.hypot(...probe.velocity),
            closest: distance,
          };
          break;
        }
      }
    }
    if (this.encounter) {
      const star = stars.find((b) => b.id === this.encounter!.star);
      if (!star || probe.id !== this.encounter.probe) {
        this.encounter = null;
        return;
      }
      const distance = Math.hypot(
        ...probe.position.map((v, i) => v - star.position[i]),
      );
      this.encounter.closest = Math.min(this.encounter.closest, distance);
      if (distance > BODY_CONFIG.encounterRadius) {
        const gain = Math.hypot(...probe.velocity) - this.encounter.entrySpeed;
        if (
          gain > 0.15 &&
          this.encounter.closest < BODY_CONFIG.encounterRadius * 0.75
        ) {
          this.gain = gain;
          this.activeUntil = system.time + 6;
          this.cooldownUntil = system.time + 12;
        }
        this.encounter = null;
      }
    }
  }
  status(time: number) {
    return time < this.activeUntil
      ? { label: "Gravitational slingshot", gain: this.gain }
      : this.encounter
        ? { label: "Close encounter", gain: 0 }
        : null;
  }
}
