# Gravitational Poetry

This is a creative WebGL artwork, not a game. Prioritize smooth, continuous physical interaction and restrained cinematic rendering.

- Work in the existing isolated checkout; do not create a worktree unless explicitly requested.
- Node >=22.12; install with `npm ci`. `postinstall` copies verified npm MediaPipe WASM assets locally.
- `npm run dev` starts Vite. `npm run typecheck`, `npm test`, `npm run build`, `npm run test:browser` validate changes.
- Browser tests default to `/usr/bin/chromium`. Set `CHROMIUM_PATH=bundled` after `npx playwright install chromium` or provide another executable path.
- Keep physics independent of React. Inputs publish normalized field state; renderers consume it. Never teleport existing particles to gesture positions.
- Integrate physical changes at fixed simulation timesteps. Keep input smoothing wall-clock based. Pause must freeze physics.
- Camera access is opt-in, local-only, and must release on page hide or unmount. Keep pointer fallback available when permissions or model loading fail.
- Never commit generated WASM, dist, credentials, or browser artifacts. The public MediaPipe model loads from Google's versioned HTTPS asset; `VITE_HAND_MODEL_URL` can point to a self-hosted copy.
- Run GPU browser checks after shader changes; TypeScript cannot validate GLSL.
- Phase 2–4 are future work: do not imply binary stars, black holes, genesis or audio already exist.
