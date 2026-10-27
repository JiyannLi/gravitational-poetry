import { mkdir, cp } from "node:fs/promises";
await mkdir("public/models/wasm", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/models/wasm", {
  recursive: true,
});
