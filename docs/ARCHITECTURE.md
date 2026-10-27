# Architecture

`React App → normalized Interaction → Universe → GPU Galaxy`

- `app`: accessible controls, camera permission flow, auto-hiding interface and responsive layout.
- `interactions/Pointer`: pointer capture, dual touch fields, strength and radius controls. C/G switches emission/gravity.
- `gestures/Hands`: lazy MediaPipe import, two hands, confidence gates, pinch strength, openness, held-fist hysteresis. It never owns particles or React state.
- `physics/field`: shared field contract, softened acceleration reference, exponential smoothing, fixed-step clock. No React dependencies.
- `particles/Galaxy`: float texture ping-pong positions/velocities. Velocity Verlet uses old and predicted acceleration. Creation recycles a small time-scaled fraction of the bounded particle reservoir into new matter with tangential initial velocities. Existing matter is integrated continuously. GPU history snapshots supply short trails; discontinuous births do not draw cross-screen trails.
- `scene/Universe`: three-dimensional perspective scene, distant stars, translucent nebula layer, matter, field cursor, bloom and tone mapping. Adaptive particle resolution resamples live textures instead of resetting the universe. Input strength fades after tracking loss. A central softened field keeps the initial galaxy evolving independently of controls.
- `events/CosmicEvents`: extensible state-condition registry with priority, duration, conflict arbitration and cooldown. No advanced events are registered in Phase 1.
- `config`: centralized baseline constants. Shader force constants currently mirror the single-field prototype; future multi-body integration should supply shared uniforms.

## Numerical model

Dimensionless artistic units; acceleration is `strength * displacement / (r² + ε²)^(3/2)`, ε=0.8 for controls and a broader central potential. Fixed step 1/120 s; bounded catch-up avoids a spiral of death. Backgrounded tabs do not accumulate elapsed time. Large sustained fields can eject matter: this is physical response, not an automatic reset. A bounded GPU reservoir represents matter; it is not an all-pairs N-body solver.

## Next phases

1. CPU velocity-Verlet massive bodies (2–3 initially), momentum-preserving initial conditions, energy diagnostics, and gravitational field uniforms for test particles.
2. State-derived collapse/merger/tidal conditions registered in the event system; lensing and accretion rendering consume event state rather than driving physics.
3. Continuous two-hand angular/separation controls, calibrated depth, optional worker-based recognition, expressive Web Audio, and more extensive device profiling.

## Deliberate limits

The initial nebula is artistically seeded; its evolution is integrated, not scripted. Dust backdrop is decorative; it does not simulate volume scattering. Trails are short sampled line segments. No general relativistic lensing, audio, persistent universe storage, massive celestial bodies, full hand-velocity calibration or genesis gestures in Phase 1. Reduced motion disables UI transitions; use Pause to stop the simulation. Float render targets/WebGL2 are required.
