# Gravitational Poetry — 引力诗篇

**Become the Architect of the Cosmos.**

A full-screen interactive cosmic artwork built with React, TypeScript, Three.js, GLSL and MediaPipe. Phase 1 focuses on a living three-dimensional particle galaxy, continuous gravitational interaction, and camera-optional creation.

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
- Touch: drag and hold; two touches control two fields.
- Enable camera: left hand shapes matter; pinch concentrates it. Right hand controls gravity; pinch or a held fist increases strength. Tracking loss smoothly releases control without clearing the universe.
- Settings: time multiplier and bloom. Toolbar: pause, reset, screenshot, camera, guide. Controls fade after inactivity and return on movement or keyboard input.

## Implemented

- 65,536 desktop / 16,384 mobile particles initially, with adaptive GPU texture downsampling to 4,096 on slow devices.
- GPU position/velocity integration, fixed-step velocity Verlet, softened gravitational fields, persistent autonomous evolution, bounded matter emission, sampled trails.
- Perspective depth, distant stars, soft nebula layer, restrained bloom, tone mapping, local fonts and responsive immersive UI.
- Two-hand MediaPipe input with confidence filtering, exponential field smoothing, pinch control and held-fist hysteresis.
- Pointer/touch fallback, permission/load errors, page visibility handling, context-loss messaging, screenshot and reset.
- Independent physics/input/rendering modules and a condition-driven event extension interface.

## Validation

```sh
npm run test:browser # uses /usr/bin/chromium in the cloud environment
# Elsewhere:
npx playwright install chromium
CHROMIUM_PATH=bundled npm run test:browser
```

Unit checks cover force direction/softening, smoothing invariance, fixed-step pause, gesture hysteresis and event cooldown. Browser checks cover real GLSL integration/readback, interactions, controls, screenshot, mobile layout and denied camera fallback. Physical-camera accuracy requires a real camera/device session; synthetic denial does not validate recognition. Software-rendered headless Chromium performance is not a hardware GPU benchmark.

## Deployment

GitHub Actions validates pushes and pull requests; the Pages workflow publishes `dist` on pushes to `main` or manual dispatch. In repository **Settings → Pages**, choose **GitHub Actions** as the build source. This must be enabled by a repository administrator if it is not already configured. No deployment token is embedded. Relative Vite asset paths support a repository subpath. Pull requests produce validation artifacts, not public per-PR preview sites.

Deployment is only confirmed when the Pages workflow succeeds and the returned page URL serves the application. Do not treat the workflow file or a guessed URL as proof of publication.

## Architecture and next steps

See [architecture](docs/ARCHITECTURE.md) and [agent instructions](AGENTS.md). Phase 2 introduces mutually interacting massive bodies and binary/three-body dynamics; Phase 3 adds state-driven cosmic phenomena; Phase 4 adds audio and broader device refinement.

This prototype does not implement black holes, genesis, massive celestial bodies or audio. GPU float-target support is required. The nebula background is an artistic layer rather than volumetric scattering. Adaptive quality intentionally trades particle density for responsiveness. Real hand-tracking quality and sustained hardware-GPU performance remain device-specific validation tasks.

For a reproducible model/inference smoke check, download the official model linked above over verified HTTPS, start `npm run preview`, then run `HAND_MODEL_PATH=/absolute/path/hand_landmarker.task npm run test:camera`. This uses Chromium synthetic video and real model inference; it does not validate real-hand accuracy.
