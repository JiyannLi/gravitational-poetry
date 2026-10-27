export type CosmicState = "Silence" | "Resonance" | "Singularity";
export interface CosmicEvent {
  id: string;
  priority: number;
  duration: number;
  cooldown: number;
  condition: (energy: number) => boolean;
}
/** Extension point: state-based events, never random playback. */
export class CosmicEvents {
  private last = new Map<string, number>();
  private active: { event: CosmicEvent; until: number } | null = null;
  constructor(private definitions: CosmicEvent[] = []) {}
  update(time: number, energy: number) {
    if (this.active && time >= this.active.until) this.active = null;
    for (const event of [...this.definitions].sort(
      (a, b) => b.priority - a.priority,
    )) {
      if (
        (!this.active || event.priority > this.active.event.priority) &&
        time - (this.last.get(event.id) ?? -Infinity) >= event.cooldown &&
        event.condition(energy)
      ) {
        this.active = { event, until: time + event.duration };
        this.last.set(event.id, time);
        break;
      }
    }
    return this.active?.event.id ?? null;
  }
}
