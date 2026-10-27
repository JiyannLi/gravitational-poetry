import * as THREE from "three";
import { smooth } from "../physics/field";
export type CelestialShape = "sphere" | "ring" | "nebula";
/** Static, shared local-space distributions. Fibonacci sampling avoids polar clumps. */
export function celestialGeometry(count: number) {
  const geometry = new THREE.BufferGeometry();
  const sphere = new Float32Array(count * 3),
    cloud = new Float32Array(count * 3),
    ring = new Float32Array(count * 3),
    data = new Float32Array(count * 3);
  const shellCount = Math.floor(count * 0.7),
    innerCount = Math.floor(count * 0.12);
  const hash = (i: number) => {
    const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < count; i++) {
    const layer = i < shellCount ? 0 : i < shellCount + innerCount ? 1 : 2;
    const local =
      layer === 0
        ? i
        : layer === 1
          ? i - shellCount
          : i - shellCount - innerCount;
    const n =
      layer === 0
        ? shellCount
        : layer === 1
          ? innerCount
          : count - shellCount - innerCount;
    const y = 1 - (2 * (local + 0.5)) / n,
      a = local * Math.PI * (3 - Math.sqrt(5)) + (hash(i + 7) - 0.5) * 0.055;
    const seed = hash(i),
      r =
        layer === 0
          ? 0.985 + seed * 0.03
          : layer === 1
            ? Math.cbrt(0.08 + seed * 0.72)
            : 1.2 + seed * 0.65;
    const p = [
      Math.sqrt(1 - y * y) * Math.cos(a) * r,
      y * r,
      Math.sqrt(1 - y * y) * Math.sin(a) * r,
    ];
    sphere.set(p, i * 3);
    const cloudR = 1.4 + hash(i + 11) * 1.5;
    cloud.set([p[0] * cloudR, p[1] * cloudR * 0.75, p[2] * cloudR], i * 3);
    if (layer === 2) {
      const rr = 1.65 + seed * 0.65;
      const z = Math.sin(a) * rr,
        thickness = (hash(i + 91) - 0.5) * 0.065;
      ring.set([Math.cos(a) * rr, z * 0.55 + thickness, z * 0.835], i * 3);
    } else ring.set(p, i * 3);
    data.set([layer, seed, a], i * 3);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(sphere, 3));
  geometry.setAttribute("cloud", new THREE.BufferAttribute(cloud, 3));
  geometry.setAttribute("ring", new THREE.BufferAttribute(ring, 3));
  geometry.setAttribute("particle", new THREE.BufferAttribute(data, 3));
  return geometry;
}
export class CelestialParticle {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  shape: CelestialShape = "sphere";
  formation = 1;
  opacity = 1;
  constructor(geometry: THREE.BufferGeometry, color: string, radius: number) {
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          color: { value: new THREE.Color(color) },
          time: { value: 0 },
          radius: { value: radius },
          pixelRatio: { value: 1 },
          formed: { value: 1 },
          ringMix: { value: 0 },
          nebulaMix: { value: 0 },
          opacity: { value: 1 },
        },
        vertexShader: `
      attribute vec3 cloud; attribute vec3 ring; attribute vec3 particle;
      uniform float time,radius,pixelRatio,formed,ringMix,nebulaMix,opacity;
      varying vec3 tint; varying float alpha;
      uniform vec3 color;
      void main(){
        float f=formed*formed*(3.-2.*formed);
        vec3 target=mix(position,ring,ringMix);
        vec3 p=mix(cloud,mix(target,cloud,nebulaMix),f);
        p*=1.+.012*sin(particle.z*3.+time*.65+particle.y*6.);
        float a=time*.12;mat3 spin=mat3(cos(a),0.,sin(a),0.,1.,0.,-sin(a),0.,cos(a));
        p=spin*p;
        vec3 normal=normalize(normalMatrix*spin*position);
        float facing=normal.z;
        float light=.34+.66*max(0.,dot(normal,normalize(vec3(-.5,.65,1.))));
        tint=mix(color,vec3(.8,.9,1.),particle.y*.15)*light;
        float layerAlpha=particle.x<.5?.85:(particle.x<1.5?.20:.30);
        alpha=layerAlpha*mix(.23,1.,smoothstep(-.2,.45,facing))*opacity;
        vec4 view=modelViewMatrix*vec4(p*radius,1.);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp((1.5+particle.y*.55)*pixelRatio*52./max(5.,-view.z),1.,6.);
      }`,
        fragmentShader: `varying vec3 tint;varying float alpha;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(tint,alpha*(1.-smoothstep(.25,1.,d)));}`,
      }),
    );
    this.points.frustumCulled = false;
  }
  update(time: number, dt: number, ratio: number) {
    const u = this.points.material.uniforms;
    u.time.value = time;
    u.pixelRatio.value = ratio;
    u.formed.value = this.formation;
    u.opacity.value = this.opacity;
    // Independent wall-time responses: expansion is quicker than ring rearrangement.
    u.ringMix.value = smooth(
      u.ringMix.value,
      this.shape === "ring" ? 1 : 0,
      dt,
      12,
    );
    u.nebulaMix.value = smooth(
      u.nebulaMix.value,
      this.shape === "nebula" ? 1 : 0,
      dt,
      18,
    );
  }
  dispose() {
    this.points.material.dispose();
  }
}
