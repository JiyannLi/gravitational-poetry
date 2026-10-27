# Architecture

`React App → normalized Interaction → Universe → GPU Galaxy`

- `app`: accessible controls, camera permission flow, auto-hiding interface and responsive layout.
- `interactions/Pointer`: pointer capture, dual touch fields, strength and radius controls. C/G switches emission/gravity.
- `gestures/Hands`: consumes timestamped observations, confidence gates, pinch preview/release and held-fist hysteresis. `HandInference` transfers one camera ImageBitmap at a time to a classic Worker, where MediaPipe runs with the CPU delegate, leaving the rendering GPU to the scene; busy frames are skipped instead of queued. Recognition errors release the camera and preserve pointer fallback. No camera images leave the device.
- `physics/field`: shared field contract, softened acceleration reference, exponential smoothing, fixed-step clock. No React dependencies.
- `particles/Galaxy`: float texture ping-pong positions/velocities. Velocity Verlet uses old and predicted acceleration. Creation recycles a small time-scaled fraction of the bounded particle reservoir into new matter with tangential initial velocities. Existing matter is integrated continuously. GPU history snapshots supply short trails; discontinuous births do not draw cross-screen trails.
- `scene/Universe`: three-dimensional perspective scene, distant stars, translucent nebula layer, matter, field cursor, bloom and tone mapping. The initial particle population remains fixed. Resize events queue a viewport update that synchronizes renderer, composer, and particle pixel ratios immediately before drawing. Scene background clearing is explicit so GPU/output passes cannot change its color-space state. Input strength fades after tracking loss. A central softened field keeps the initial galaxy evolving independently of controls.
- `physics/BodySystem`: CPU velocity-Verlet integration of up to three stars plus one low-mass probe. Pair forces are antisymmetric; energy and center-of-mass diagnostics support regression tests. Hand fields are external forces, so energy is deliberately not conserved during interaction.
- `scene/CelestialBodies`: owns particle views and bounded trail histories. `particles/CelestialParticle` shares one static BufferGeometry with 70% Fibonacci shell, 12% volume, 18% surrounding dust. Vertex shaders rotate/disturb and interpolate sphere/ring/cloud coordinates; CPU updates only uniforms. Preview points transfer unchanged to the committed body, retaining visible size and rotation phase. Body movement still comes solely from physics. Background GPU dust uses analytic silhouette attenuation for readable translucent shells; no solid occluding sphere is added. Resources are released when systems change.
- `events/OrbitalEvents`: actual probe approach/departure at a common radius, closest approach, kinetic-speed gain, six-second feedback lifecycle and cooldown. It does not modify physics.
- `events/CosmicEvents`: general condition/priority/lifecycle registry reserved for more advanced Phase 3 phenomena.
- `config`: centralized baseline constants. Shader force constants currently mirror the single-field prototype; future multi-body integration should supply shared uniforms.

## Numerical model

Dimensionless artistic units; acceleration is `strength * displacement / (r² + ε²)^(3/2)`, ε=0.8 for controls and a broader central potential. Fixed step 1/120 s; bounded catch-up avoids a spiral of death. Backgrounded tabs do not accumulate elapsed time. Large sustained fields can eject matter: this is physical response, not an automatic reset. A bounded GPU reservoir represents matter; it is not an all-pairs N-body solver.

## Phase 2 physical universe

Binary/three-body/slingshot buttons set initial conditions only. The binary velocity includes the softened force law; the three-body setup is centered in position and momentum and can develop close encounters or eject a body. Slingshot mode starts a moving massive star and a low-mass probe on an unbound approach. Manual placement supplies an initial tangential velocity around the existing center of mass. A confident left pinch immediately previews gathering; a deliberate release commits once after at least 450 ms. Full formation takes 650 ms. Tracking loss cancels rather than commits. Pointer long-press offers the same preview while preserving quick click placement.

GPU test particles receive a separate bounded array of body fields, in addition to the two hand fields and the weak decorative central potential. Uniform branches skip inactive body sources. Massive bodies do not feel that decorative central field or particle backreaction. There are no collisions, merges or relativistic terms. Pause/time scaling drives both physical systems and trail sampling. Stars are never teleported by subsequent hand input.

## Next phases

1. State-derived collapse/merger/tidal conditions registered in the event system; lensing and accretion rendering consume event state rather than driving physics.
2. Continuous two-hand angular/separation controls, calibrated depth, expressive Web Audio, and more extensive device profiling.

## Deliberate limits

The initial nebula is artistically seeded; its evolution is integrated, not scripted. Dust backdrop is decorative; it does not simulate volume scattering. Trails are short sampled line segments. No general relativistic lensing, audio, persistent universe storage, collision/merger model, full hand-velocity calibration or genesis gestures. Reduced motion disables UI transitions; use Pause to stop the simulation. Float render targets/WebGL2 are required.

## Morph/control response

Control smoothing uses wall time, independently of physical time flow. Position response rate rises from 16/s near a stationary target to 48/s during larger movement; strength uses 24/s. Shape weights use separate exponential responses (ring 12/s, expansion 18/s), preserving continuity when reversed and matching at 30/60/120 Hz. Pausing freezes body/particle rotation and shape interpolation. Rings are a visual option, not a change to mass or orbital dynamics. Celestial size is deliberately a visual scale; there is no collision radius.

Development console `poetryDiagnostics()` reports inference duration, capture-to-result duration, result delivery interval, age, in-flight count and normalized control fields; it never exposes camera frames. These clocks measure different parts of the chain and cannot be summed as if FPS were input latency. See `PHASE2-MORPH.md` for measured results and limitations.
