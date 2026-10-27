import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Galaxy } from "../particles/Galaxy";
import { Pointer } from "../interactions/Pointer";
import { Hands } from "../gestures/Hands";
import { FixedClock, smooth, type Interaction } from "../physics/field";
import { CONFIG } from "../config/universe";
export class Universe {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 250);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private galaxy: Galaxy;
  readonly pointer: Pointer;
  private hands: Hands | null = null;
  private clock = new FixedClock();
  private frame = 0;
  private previous = 0;
  private elapsed = 0;
  private samples = 0;
  private total = 0;
  private lowFrames = 0;
  private particleSize = 256;
  private input: Interaction = {
    fields: [
      { position: [0, 0, 0], strength: 0, radius: 8, creation: 0 },
      { position: [0, 0, 0], strength: 0, radius: 8, creation: 0 },
    ],
    active: false,
    expansion: 0,
  };
  private marker: THREE.Mesh;
  speed = 1;
  paused = false;
  private disposed = false;
  constructor(
    private container: HTMLElement,
    private report: (fps: number, count: number, state: string) => void,
    private fail: (message: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, CONFIG.maxPixelRatio),
    );
    this.renderer.setClearColor("#03040a");
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 52);
    this.camera.lookAt(0, 0, 0);
    this.particleSize =
      innerWidth < 700 ? CONFIG.mobileSize : CONFIG.desktopSize;
    this.galaxy = new Galaxy(this.renderer, this.particleSize);
    this.scene.add(this.galaxy.points, this.galaxy.trails);
    const starGeometry = new THREE.BufferGeometry(),
      stars = new Float32Array(2200 * 3);
    for (let i = 0; i < 2200; i++) {
      stars[i * 3] = (Math.random() - 0.5) * 170;
      stars[i * 3 + 1] = (Math.random() - 0.5) * 110;
      stars[i * 3 + 2] = -20 - Math.random() * 80;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    this.scene.add(
      new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({
          color: 0x859cc8,
          size: 0.055,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      ),
    );
    // Broad, transparent volumetric-looking dust, independent from the sharp matter layer.
    const dust = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 75),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 } },
        vertexShader: `varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 uvv;uniform float time;void main(){vec2 p=(uvv-.5)*2.;float a=atan(p.y,p.x);float r=length(p*vec2(1.,1.5));float cloud=exp(-r*r*3.)*(.55+.25*sin(p.x*13.+sin(p.y*9.))*cos(p.y*11.+p.x*3.));vec3 c=mix(vec3(.10,.13,.35),vec3(.25,.13,.32),uvv.x);gl_FragColor=vec4(c,cloud*.25);}`,
      }),
    );
    dust.position.z = -8;
    this.scene.add(dust);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.32, 64),
      new THREE.MeshBasicMaterial({
        color: 0x9ddfff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      }),
    );
    this.scene.add(this.marker);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.6, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.pointer = new Pointer(this.renderer.domElement);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }
  private contextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.frame);
    this.fail("Graphics context interrupted. Reload to restore the universe.");
  };
  private visibility = () => {
    this.previous = 0;
    if (document.hidden) {
      this.hands?.stop();
      this.hands = null;
    }
  };
  private resize = () => {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };
  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const wallDt = this.previous ? (now - this.previous) / 1000 : 0;
    const dt = Math.min(wallDt, 0.1);
    this.previous = now;
    if (document.hidden) return;
    let target: Interaction;
    try {
      target = this.hands
        ? this.hands.read(now, this.camera.aspect)
        : this.pointer.read(this.camera.aspect);
    } catch {
      this.hands?.stop();
      this.hands = null;
      this.fail("Hand tracking interrupted. Pointer controls are available.");
      target = this.pointer.read(this.camera.aspect);
    }
    this.input.active = target.active;
    this.input.fields.forEach((f, i) => {
      const t = target.fields[i];
      for (let j = 0; j < 3; j++)
        f.position[j] = smooth(
          f.position[j],
          t?.position[j] ?? f.position[j],
          dt,
        );
      f.strength = smooth(f.strength, t?.strength ?? 0, dt, 5);
      f.creation = smooth(f.creation, t?.creation ?? 0, dt, 5);
    });
    if (!this.paused)
      this.clock.advance(dt, this.speed, (step) => {
        this.galaxy.step(step, this.input);
        this.elapsed += step;
      });
    this.marker.position.set(...this.input.fields[0].position);
    (this.marker.material as THREE.MeshBasicMaterial).opacity = smooth(
      (this.marker.material as THREE.MeshBasicMaterial).opacity,
      target.active ? 0.45 : 0,
      dt,
    );
    this.composer.render();
    this.samples++;
    this.total += wallDt;
    if (this.total >= 1) {
      const fps = Math.round(this.samples / this.total);
      if (fps < 28 && !this.paused) this.lowFrames++;
      else this.lowFrames = 0;
      if (
        (this.lowFrames >= 3 || (fps < 12 && this.lowFrames >= 1)) &&
        this.particleSize > 64
      ) {
        this.particleSize /= 2;
        const next = new Galaxy(this.renderer, this.particleSize);
        this.galaxy.transferTo(next);
        this.scene.remove(this.galaxy.points, this.galaxy.trails);
        this.galaxy.dispose();
        this.galaxy = next;
        this.scene.add(next.points, next.trails);
        this.renderer.setPixelRatio(Math.min(1, this.particleSize / 128));
        this.resize();
        this.lowFrames = 0;
      }
      this.report(
        fps,
        this.galaxy.points.geometry.drawRange.count === Infinity
          ? this.galaxy.count
          : this.galaxy.points.geometry.drawRange.count,
        this.input.fields.some((f) => f.strength > 15)
          ? "Resonance"
          : "Silence",
      );
      this.samples = 0;
      this.total = 0;
    }
  };
  async enableCamera() {
    this.hands?.stop();
    const hands = new Hands();
    this.hands = hands;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        hands.start(),
        new Promise<boolean>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Camera/model loading timed out. Check connectivity; pointer controls remain available.",
                ),
              ),
            25000,
          );
        }),
      ]);
    } catch (e) {
      hands.stop();
      if (this.hands === hands) this.hands = null;
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  disableCamera() {
    this.hands?.stop();
    this.hands = null;
  }
  setBloom(value: number) {
    this.bloom.strength = value;
  }
  reset() {
    this.galaxy.reset();
    this.elapsed = 0;
  }
  screenshot() {
    this.composer.render();
    const a = document.createElement("a");
    a.download = "gravitational-poetry.png";
    a.href = this.renderer.domElement.toDataURL("image/png");
    a.click();
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.contextLost,
    );
    this.hands?.stop();
    this.pointer.dispose();
    this.galaxy.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        if (o === this.galaxy.points) return;
        o.geometry.dispose();
        const m = o.material;
        Array.isArray(m) ? m.forEach((v) => v.dispose()) : m.dispose();
      }
    });
    this.composer.passes.forEach((p) => p.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
