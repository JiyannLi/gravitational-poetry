import * as THREE from "three";
import {
  BODY_CONFIG,
  type BodySystem,
  type CelestialBody,
} from "../physics/BodySystem";
import { smooth, type Vec3 } from "../physics/field";
import {
  celestialGeometry,
  CelestialParticle,
  type CelestialShape,
} from "../particles/CelestialParticle";
interface BodyView {
  group: THREE.Group;
  surface: CelestialParticle;
  trail: THREE.Line;
  history: Vec3[];
  lastSample: number;
  timeOffset: number;
}
export class CelestialBodies {
  readonly group = new THREE.Group();
  private views = new Map<number, BodyView>();
  private geometry = celestialGeometry(innerWidth < 700 ? 2048 : 4096);
  private preview: CelestialParticle | null = null;
  private previewPosition: Vec3 = [0, 0, 0];
  private previewTime = 0;
  private previewCancelled = false;
  shape: CelestialShape = "sphere";
  private create(body: CelestialBody): BodyView {
    const color = new THREE.Color(body.color);
    const surface = new CelestialParticle(
      this.geometry,
      body.color,
      body.radius * (body.kind === "probe" ? 1 : 3.2),
    );
    const group = new THREE.Group();
    group.add(surface.points);
    this.group.add(group);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(BODY_CONFIG.trailLength * 3),
        3,
      ),
    );
    geometry.setAttribute(
      "fade",
      new THREE.BufferAttribute(new Float32Array(BODY_CONFIG.trailLength), 1),
    );
    geometry.setDrawRange(0, 0);
    const trail = new THREE.Line(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { color: { value: color } },
        vertexShader: `attribute float fade;varying float opacity;void main(){opacity=fade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform vec3 color;varying float opacity;void main(){gl_FragColor=vec4(color,opacity*.4);}`,
      }),
    );
    trail.frustumCulled = false;
    this.group.add(trail);
    return {
      group,
      surface,
      trail,
      history: [],
      lastSample: -Infinity,
      timeOffset: 0,
    };
  }
  previewFormation(
    position: Vec3,
    progress: number,
    mass: number,
    colorIndex = 0,
  ) {
    if (!this.preview) {
      this.preview = new CelestialParticle(
        this.geometry,
        BODY_CONFIG.colors[colorIndex % 3],
        (0.25 + Math.cbrt(mass) * 0.19) * 3.2,
      );
      this.group.add(this.preview.points);
    }
    this.previewCancelled = false;
    this.previewPosition = [...position];
    this.preview.points.position.set(...position);
    this.preview.formation = progress;
    this.preview.opacity = 0.35 + progress * 0.65;
    this.preview.shape = this.shape;
    this.preview.points.material.uniforms.radius.value =
      (0.25 + Math.cbrt(mass) * 0.19) * 3.2 * (0.65 + 0.35 * progress);
  }
  get creationPosition(): Vec3 | null {
    return this.preview && !this.previewCancelled
      ? [...this.previewPosition]
      : null;
  }
  releasePreview(body: CelestialBody | null, time: number) {
    if (!this.preview) return;
    if (body) {
      const view = this.create(body);
      view.group.remove(view.surface.points);
      view.surface.dispose();
      view.surface = this.preview;
      view.timeOffset = this.previewTime - time;
      this.preview.points.material.uniforms.color.value.set(body.color);
      this.group.remove(this.preview.points);
      this.preview.points.position.set(0, 0, 0);
      view.group.add(this.preview.points);
      view.group.position.set(...body.position);
      // Keep exactly the visible radius and distribution at release.
      this.views.set(body.id, view);
      this.preview = null;
    } else this.previewCancelled = true;
  }
  cancelPreview() {
    this.previewCancelled = true;
  }
  update(system: BodySystem, dt = 0, ratio = 1, paused = false) {
    const ids = new Set(system.bodies.map((body) => body.id));
    for (const [id, view] of this.views)
      if (!ids.has(id)) {
        this.remove(view);
        this.views.delete(id);
      }
    for (const body of system.bodies) {
      let view = this.views.get(body.id);
      if (!view) {
        view = this.create(body);
        this.views.set(body.id, view);
      }
      view.group.position.set(...body.position);
      if (!paused)
        view.surface.formation = smooth(view.surface.formation, 1, dt, 18);
      view.surface.shape = this.shape;
      view.surface.update(
        system.time + view.timeOffset,
        paused ? 0 : dt,
        ratio,
      );
      if (system.time - view.lastSample >= BODY_CONFIG.trailInterval) {
        view.history.push([...body.position]);
        if (view.history.length > BODY_CONFIG.trailLength) view.history.shift();
        view.lastSample = system.time;
        const positions = view.trail.geometry.getAttribute(
            "position",
          ) as THREE.BufferAttribute,
          fade = view.trail.geometry.getAttribute(
            "fade",
          ) as THREE.BufferAttribute;
        view.history.forEach((p, i) => {
          positions.setXYZ(i, ...p);
          fade.setX(i, i / Math.max(1, view.history.length - 1));
        });
        positions.needsUpdate = true;
        fade.needsUpdate = true;
        view.trail.geometry.setDrawRange(0, view.history.length);
      }
    }
    if (this.preview) {
      if (!paused) this.previewTime += dt;
      if (this.previewCancelled && !paused) {
        this.preview.formation = Math.max(0, this.preview.formation - dt * 4);
        this.preview.opacity = Math.max(0, this.preview.opacity - dt * 3);
      }
      this.preview.points.position.set(...this.previewPosition);
      this.preview.update(this.previewTime, paused ? 0 : dt, ratio);
      if (this.preview.opacity === 0) {
        this.group.remove(this.preview.points);
        this.preview.dispose();
        this.preview = null;
      }
    }
  }
  /** Analytic particle-volume occlusion: prevents background dust washing out the shell. */
  occluders() {
    const result = [...this.views.values()].map((view) => ({
      position: view.group.position,
      surface: view.surface,
    }));
    if (this.preview)
      result.push({
        position: this.preview.points.position,
        surface: this.preview,
      });
    return result.map(({ position, surface }) => ({
      position,
      radius: surface.points.material.uniforms.radius.value as number,
      opacity:
        surface.opacity *
        surface.formation *
        (1 - surface.points.material.uniforms.nebulaMix.value),
    }));
  }
  private remove(view: BodyView) {
    this.group.remove(view.group, view.trail);
    view.surface.dispose();
    view.trail.geometry.dispose();
    (view.trail.material as THREE.Material).dispose();
  }
  dispose() {
    for (const view of this.views.values()) this.remove(view);
    this.views.clear();
    this.preview?.dispose();
    this.geometry.dispose();
  }
}
