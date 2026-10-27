import * as THREE from "three";
import {
  BODY_CONFIG,
  type BodySystem,
  type CelestialBody,
} from "../physics/BodySystem";
import type { Vec3 } from "../physics/field";
interface BodyView {
  group: THREE.Group;
  surface: THREE.Mesh;
  halo: THREE.Sprite;
  trail: THREE.Line;
  history: Vec3[];
  lastSample: number;
}
export class CelestialBodies {
  readonly group = new THREE.Group();
  private views = new Map<number, BodyView>();
  private glow: THREE.CanvasTexture;
  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,.3)");
    g.addColorStop(0.25, "rgba(255,255,255,.15)");
    g.addColorStop(0.6, "rgba(255,255,255,.025)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    this.glow = new THREE.CanvasTexture(canvas);
  }
  private create(body: CelestialBody): BodyView {
    const color = new THREE.Color(body.color);
    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(body.radius, 32, 24),
      new THREE.ShaderMaterial({
        uniforms: { color: { value: color }, time: { value: 0 } },
        vertexShader: `varying vec3 n;varying vec3 p;void main(){n=normalize(normalMatrix*normal);p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform vec3 color;uniform float time;varying vec3 n;varying vec3 p;void main(){float grain=sin(p.x*28.+sin(p.y*22.+time*.12))*sin(p.z*23.-time*.08);float limb=pow(max(.0,abs(normalize(n).z)),.4);vec3 light=mix(color*.45,vec3(1.,.95,.85),limb*.55);gl_FragColor=vec4(light*(1.15+limb*.6+grain*.08),1.);}`,
      }),
    );
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glow,
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.55,
      }),
    );
    halo.scale.setScalar(body.radius * 9);
    const group = new THREE.Group();
    group.add(surface, halo);
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
    return { group, surface, halo, trail, history: [], lastSample: -Infinity };
  }
  update(system: BodySystem) {
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
      (view.surface.material as THREE.ShaderMaterial).uniforms.time.value =
        system.time;
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
  }
  private remove(view: BodyView) {
    this.group.remove(view.group, view.trail);
    view.surface.geometry.dispose();
    (view.surface.material as THREE.Material).dispose();
    view.halo.material.dispose();
    view.trail.geometry.dispose();
    (view.trail.material as THREE.Material).dispose();
  }
  dispose() {
    for (const view of this.views.values()) this.remove(view);
    this.views.clear();
    this.glow.dispose();
  }
}
