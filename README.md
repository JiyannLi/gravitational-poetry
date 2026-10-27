# Gravitational Poetry — 引力诗篇

**Become the Architect of the Cosmos.**

A full-screen interactive cosmic artwork built with React, TypeScript, Three.js, GLSL and MediaPipe. Phases 1–2 provide a living three-dimensional particle galaxy, continuous gravitational interaction, camera-optional creation, and a mutually interacting physical universe.

## Run

Node **22.12+** (tested here with Node 24).

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

`npm ci` copies MediaPipe WASM from the pinned npm package into ignored local assets. Fonts are bundled locally. Camera activation downloads Google's versioned [Hand Landmarker model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task). Allow that domain in network policy. To self-host the model, set `VITE_HAND_MODEL_URL` at build time to its URL. Camera access requires HTTPS or localhost and explicit permission. Video frames are processed locally and never uploaded.

## Interact

- Move the pointer: position a softened gravity field. Hold: deepen its strength. Scroll: adjust influence.
- **C**: create flowing matter while holding. **G**: gravity mode. **Space**: pause/resume.
- **S**: place a star on the next canvas click/tap. **B**: binary stars. **T**: three-body motion. **L**: a moving-star gravity-assist encounter. The Celestial systems panel also exposes these controls and the mass of newly created stars (up to three stars).
- Touch: drag and hold; two touches control two fields.
- Enable camera: left hand shapes matter; pinch concentrates it, and a confident pinch held for 1.1 seconds creates one star. Release before creating the next. Right hand controls gravity; pinch or a held fist increases strength. Tracking loss smoothly releases control without clearing the universe.
- Settings: time multiplier and bloom. Toolbar: pause, reset, screenshot, camera, guide. Controls fade after inactivity and return on movement or keyboard input.

## Implemented

- 65,536 desktop / 16,384 mobile particles, retained for the lifetime of the scene. The startup preset and capped device pixel ratio stay stable; FPS reporting never removes matter or changes render resolution.
- GPU position/velocity integration, fixed-step velocity Verlet, softened gravitational fields, persistent autonomous evolution, bounded matter emission, sampled trails.
- Perspective depth, distant stars, soft nebula layer, restrained bloom, tone mapping, local fonts and responsive immersive UI.
- Two-hand MediaPipe input with confidence filtering, exponential field smoothing, pinch control and held-fist hysteresis.
- Pointer/touch fallback, permission/load errors, page visibility handling, context-loss messaging, screenshot and reset.
- Up to three massive stars, mutually coupled softened Newtonian gravity, velocity-Verlet integration, depth-aware stellar surfaces, halos and persistent orbital trails.
- Binary and three-body initial conditions, user-created stars, inertial response to hand/pointer fields, autonomous evolution, and a low-mass probe for gravitational slingshots.
- Slingshot recognition measures actual entry/exit velocity at a common encounter radius; no scripted trajectory or velocity kick.
- Independent physics/input/rendering modules and a condition-driven event extension interface.

## Validation

```sh
npm run test:browser # uses /usr/bin/chromium in the cloud environment
# Elsewhere:
npx playwright install chromium
CHROMIUM_PATH=bundled npm run test:browser
```

Unit checks cover force direction/softening, smoothing invariance, fixed-step pause, gesture hysteresis and creation dwell, event cooldown, binary energy/momentum conservation, finite three-body evolution and real slingshot energy transfer. Browser checks cover real GLSL integration/readback, stellar influence on GPU dust, system creation/selection, controls, screenshot, mobile layout, denied/delayed camera fallback, and the startup-flash regression. Physical-camera accuracy requires a real camera/device session; synthetic denial does not validate recognition. Software-rendered headless Chromium performance is not a hardware GPU benchmark.

## Deployment

GitHub Actions validates pushes and pull requests; the Pages workflow publishes `dist` on pushes to `main` or manual dispatch. In repository **Settings → Pages**, choose **GitHub Actions** as the build source. This must be enabled by a repository administrator if it is not already configured. No deployment token is embedded. Relative Vite asset paths support a repository subpath. Pull requests produce validation artifacts, not public per-PR preview sites.

Deployment is only confirmed when the Pages workflow succeeds and the returned page URL serves the application. Do not treat the workflow file or a guessed URL as proof of publication.

## Architecture and next steps

See [architecture](docs/ARCHITECTURE.md) and [agent instructions](AGENTS.md). Phase 2 is implemented. Phase 3 can add state-driven collapse, tidal phenomena and black holes; Phase 4 adds audio and broader device refinement.

This prototype does not implement black holes, genesis, collisions/mergers or audio. The three-body preset is a physical initial condition, not a guaranteed repeating orbit; encounters may eject a body. Stellar radii are visual only, and nearby forces are softened. GPU float-target support is required. The nebula background is an artistic layer rather than volumetric scattering. The fixed population avoids brightness jumps but can be expensive on low-end GPUs; there is currently no automatic runtime density reduction. Real hand-tracking quality and sustained hardware-GPU performance remain device-specific validation tasks.

For a reproducible model/inference smoke check, download the official model linked above over verified HTTPS, start `npm run preview`, then run `HAND_MODEL_PATH=/absolute/path/hand_landmarker.task npm run test:camera`. This uses Chromium synthetic video and real model inference; it does not validate real-hand accuracy.
