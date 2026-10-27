import type { Interaction } from "../physics/field";
export class Pointer {
  mode: "gravity" | "creation" = "gravity";
  radius = 8;
  private contacts = new Map<number, { x: number; y: number }>();
  private x = 0;
  private y = 0;
  private seen = false;
  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.up);
    canvas.addEventListener("pointerleave", this.leave);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
  }
  private move = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.y = 1 - ((e.clientY - r.top) / r.height) * 2;
    this.seen = true;
    if (this.contacts.has(e.pointerId))
      this.contacts.set(e.pointerId, { x: this.x, y: this.y });
  };
  private down = (e: PointerEvent) => {
    this.move(e);
    this.contacts.set(e.pointerId, { x: this.x, y: this.y });
    this.canvas.setPointerCapture(e.pointerId);
  };
  private up = (e: PointerEvent) => {
    this.contacts.delete(e.pointerId);
    if (e.pointerType === "touch") this.seen = false;
  };
  private leave = () => {
    if (!this.contacts.size) this.seen = false;
  };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.radius = Math.max(3, Math.min(18, this.radius - e.deltaY * 0.01));
  };
  read(aspect: number): Interaction {
    const points =
      this.contacts.size > 1
        ? [...this.contacts.values()].slice(0, 2)
        : [{ x: this.x, y: this.y }];
    return {
      active: this.seen,
      expansion: 0,
      fields: points.map((p) => ({
        position: [p.x * 22 * aspect, p.y * 22, 0],
        strength: this.seen
          ? ((this.contacts.size ? 30 : 8) * this.radius) / 8
          : 0,
        radius: this.radius,
        creation: this.mode === "creation" && this.contacts.size ? 1 : 0,
      })),
    };
  }
  dispose() {
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.up);
    this.canvas.removeEventListener("pointerleave", this.leave);
    this.canvas.removeEventListener("wheel", this.wheel);
  }
}
