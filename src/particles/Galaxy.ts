import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import type { Field, Interaction } from "../physics/field";
import { BODY_CONFIG } from "../physics/BodySystem";
const force = `
vec3 acceleration(vec3 p) {
 vec3 a=-p*5.0/pow(dot(p,p)+9.0,1.5);
 for(int i=0;i<2;i++) {
  vec3 d=fields[i].xyz-p;
  float r2=dot(d,d)+0.64;
  a+=d*fields[i].w/pow(r2,1.5);
  a+=cross(vec3(0.,0.,1.),d)*creation[i]*exp(-r2/90.)*.10;
 }
 for(int i=0;i<${BODY_CONFIG.maxBodies};i++) {
  if(bodyFields[i].w>0.) {vec3 d=bodyFields[i].xyz-p;float r2=dot(d,d)+0.64;a+=d*bodyFields[i].w/pow(r2,1.5);}
 }
 return a+normalize(p+vec3(.001))*expansion*.8;
}`;
const emission = `
float random(vec2 uv){return fract(sin(dot(uv,vec2(12.9898,78.233)))*43758.5453);}
float source(vec2 uv){
 float h=random(uv+floor(time*120.)*.001);
 for(int i=0;i<2;i++)if(creation[i]>.05 && h<creation[i]*dt*.13)return float(i);
 return -1.;
}
vec3 birthplace(vec2 uv,int i){float a=random(uv)*6.283;float r=sqrt(random(uv+.37))*3.;return fields[i].xyz+vec3(cos(a)*r,sin(a)*r,(random(uv+.61)-.5)*2.);}
`;
const uniforms = `uniform float dt; uniform float time; uniform vec4 fields[2]; uniform float creation[2]; uniform float expansion; uniform vec4 bodyFields[${BODY_CONFIG.maxBodies}];`;
export class Galaxy {
  readonly points: THREE.Points;
  readonly trails: THREE.LineSegments;
  private history: THREE.WebGLRenderTarget;
  private lastHistory = 0;
  private gpu: GPUComputationRenderer;
  private pos;
  private vel;
  private time = 0;
  private originalPosition: THREE.DataTexture;
  private originalVelocity: THREE.DataTexture;
  readonly count: number;
  constructor(
    private renderer: THREE.WebGLRenderer,
    size: number,
  ) {
    this.count = size * size;
    this.gpu = new GPUComputationRenderer(size, size, renderer);
    this.originalPosition = this.gpu.createTexture();
    this.originalVelocity = this.gpu.createTexture();
    const p = this.originalPosition.image.data as Float32Array,
      v = this.originalVelocity.image.data as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const r = 1.3 + Math.pow(Math.random(), 0.65) * 23,
        arm = i % 3;
      const angle =
        r * 0.19 +
        (arm * Math.PI * 2) / 3 +
        (Math.random() - 0.5) * (0.55 + r * 0.04);
      p[i * 4] = Math.cos(angle) * r;
      p[i * 4 + 1] = Math.sin(angle) * r * 0.68;
      p[i * 4 + 2] =
        Math.sin(angle) * r * 0.23 + (Math.random() - 0.5) * (1.3 + r * 0.13);
      p[i * 4 + 3] = Math.random();
      const speed = Math.sqrt(5 / r) * 0.82;
      v[i * 4] = -Math.sin(angle) * speed;
      v[i * 4 + 1] = Math.cos(angle) * speed;
      v[i * 4 + 2] = (Math.random() - 0.5) * 0.03;
      v[i * 4 + 3] = 1;
    }
    this.pos = this.gpu.addVariable(
      "texturePosition",
      `${uniforms}${force}${emission}
void main(){vec2 uv=gl_FragCoord.xy/resolution.xy; vec4 p=texture2D(texturePosition,uv); vec3 v=texture2D(textureVelocity,uv).xyz;
p.xyz+=v*dt+0.5*acceleration(p.xyz)*dt*dt;float spawn=source(uv);if(spawn>=0.)p.xyz=birthplace(uv,int(spawn)); gl_FragColor=p;}`,
      this.originalPosition,
    );
    this.vel = this.gpu.addVariable(
      "textureVelocity",
      `${uniforms}${force}${emission}
void main(){vec2 uv=gl_FragCoord.xy/resolution.xy;vec3 p=texture2D(texturePosition,uv).xyz;vec4 v=texture2D(textureVelocity,uv);vec3 a=acceleration(p);vec3 next=p+v.xyz*dt+.5*a*dt*dt;v.xyz+=.5*(a+acceleration(next))*dt;float spawn=source(uv);if(spawn>=0.){vec3 d=birthplace(uv,int(spawn))-fields[int(spawn)].xyz;v.xyz=cross(vec3(0.,0.,1.),d)*.35;}gl_FragColor=v;}`,
      this.originalVelocity,
    );
    for (const variable of [this.pos, this.vel]) {
      this.gpu.setVariableDependencies(variable, [this.pos, this.vel]);
      Object.assign(variable.material.uniforms, {
        dt: { value: 0 },
        time: { value: 0 },
        fields: { value: [new THREE.Vector4(), new THREE.Vector4()] },
        bodyFields: {
          value: Array.from(
            { length: BODY_CONFIG.maxBodies },
            () => new THREE.Vector4(),
          ),
        },
        creation: { value: [0, 0] },
        expansion: { value: 0 },
      });
    }
    const error = this.gpu.init();
    if (error) throw new Error(error);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(this.count * 3), 3),
    );
    const refs = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      refs[i * 2] = ((i % size) + 0.5) / size;
      refs[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
    }
    geometry.setAttribute("reference", new THREE.BufferAttribute(refs, 2));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        positions: { value: null },
        pixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: `
attribute vec2 reference;uniform sampler2D positions;uniform float pixelRatio;varying vec3 color;varying float alpha;
void main(){vec4 p=texture2D(positions,reference);vec4 view=modelViewMatrix*vec4(p.xyz,1.);gl_Position=projectionMatrix*view;
float warm=smoothstep(.76,1.,p.w);color=mix(mix(vec3(.18,.34,.8),vec3(.55,.75,1.),p.w),vec3(1.,.68,.35),warm);
alpha=.3+p.w*.6;gl_PointSize=clamp((1.1+p.w*1.8)*pixelRatio*48./max(5.,-view.z),1.,8.);}`,
      fragmentShader: `varying vec3 color;varying float alpha;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float light=exp(-d*d*6.);gl_FragColor=vec4(color*1.5,light*alpha);}`,
    });
    this.history = this.gpu.createRenderTarget(
      size,
      size,
      THREE.ClampToEdgeWrapping,
      THREE.ClampToEdgeWrapping,
      THREE.NearestFilter,
      THREE.NearestFilter,
    );
    this.gpu.renderTexture(this.originalPosition, this.history);
    const trailCount = Math.floor(this.count / 8),
      trailRefs = new Float32Array(trailCount * 4),
      ends = new Float32Array(trailCount * 2);
    for (let i = 0; i < trailCount; i++)
      for (let j = 0; j < 2; j++) {
        trailRefs[i * 4 + j * 2] = refs[i * 16];
        trailRefs[i * 4 + j * 2 + 1] = refs[i * 16 + 1];
        ends[i * 2 + j] = j;
      }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(trailCount * 6), 3),
    );
    tg.setAttribute("reference", new THREE.BufferAttribute(trailRefs, 2));
    tg.setAttribute("end", new THREE.BufferAttribute(ends, 1));
    this.trails = new THREE.LineSegments(
      tg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          positions: { value: null },
          history: { value: this.history.texture },
        },
        vertexShader: `attribute vec2 reference;attribute float end;uniform sampler2D positions;uniform sampler2D history;varying float opacity;void main(){vec3 p=texture2D(positions,reference).xyz;vec3 old=texture2D(history,reference).xyz;opacity=end*.18*(1.-step(3.,distance(p,old)));gl_Position=projectionMatrix*modelViewMatrix*vec4(mix(old,p,end),1.);}`,
        fragmentShader: `varying float opacity;void main(){gl_FragColor=vec4(.3,.55,1.,opacity);}`,
      }),
    );
    this.trails.frustumCulled = false;
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.sync();
  }
  step(dt: number, input: Interaction, bodies: Field[] = []) {
    this.time += dt;
    if (this.time - this.lastHistory > 0.35) {
      this.gpu.renderTexture(
        this.gpu.getCurrentRenderTarget(this.pos).texture,
        this.history,
      );
      this.lastHistory = this.time;
    }
    for (const variable of [this.pos, this.vel]) {
      const u = variable.material.uniforms;
      u.dt.value = dt;
      u.time.value = this.time;
      u.expansion.value = input.expansion;
      for (let i = 0; i < BODY_CONFIG.maxBodies; i++) {
        const body = bodies[i];
        u.bodyFields.value[i].set(
          ...(body?.position ?? [0, 0, 0]),
          body?.strength ?? 0,
        );
      }
      for (let i = 0; i < 2; i++) {
        const f = input.fields[i];
        u.fields.value[i].set(...(f?.position ?? [0, 0, 0]), f?.strength ?? 0);
        u.creation.value[i] = f?.creation ?? 0;
      }
    }
    this.gpu.compute();
    this.sync();
  }
  private sync() {
    (this.trails.material as THREE.ShaderMaterial).uniforms.positions.value =
      this.gpu.getCurrentRenderTarget(this.pos).texture;
    (this.points.material as THREE.ShaderMaterial).uniforms.positions.value =
      this.gpu.getCurrentRenderTarget(this.pos).texture;
  }
  reset() {
    this.time = 0;
    this.lastHistory = 0;
    this.gpu.renderTexture(this.originalPosition, this.history);
    for (const variable of [this.pos, this.vel])
      for (const target of variable.renderTargets)
        this.gpu.renderTexture(
          variable === this.pos ? this.originalPosition : this.originalVelocity,
          target,
        );
    this.sync();
  }
  setPixelRatio(ratio: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.pixelRatio.value =
      ratio;
  }
  /** Small readback for numerical diagnostics; not used by the animation loop. */
  sample() {
    const result = new Float32Array(4 * 16);
    this.renderer.readRenderTargetPixels(
      this.gpu.getCurrentRenderTarget(this.pos),
      0,
      0,
      16,
      1,
      result,
    );
    return Array.from(result);
  }
  dispose() {
    this.history.dispose();
    this.trails.geometry.dispose();
    (this.trails.material as THREE.Material).dispose();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.gpu.dispose();
  }
}
