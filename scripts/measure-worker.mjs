import { chromium } from "@playwright/test";
import { writeFile, access } from "node:fs/promises";
const model = process.env.HAND_MODEL_PATH;
if (!model) throw Error("HAND_MODEL_PATH is required");
await access(model);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.route("**/worker-probe", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<canvas width="640" height="480"></canvas><video muted playsinline></video>',
    }),
  );
  await page
    .context()
    .route("**/probe-model.task", (r) =>
      r.fulfill({ path: model, contentType: "application/octet-stream" }),
    );
  await page.goto("http://127.0.0.1:5173/worker-probe");
  const result = await page.evaluate(async () => {
    const { HandInference } = await import("/src/gestures/HandInference.ts");
    const inference = new HandInference();
    await inference.start(
      location.origin + "/",
      location.origin + "/probe-model.task",
    );
    const canvas = document.querySelector("canvas"),
      ctx = canvas.getContext("2d"),
      video = document.querySelector("video");
    const stream = canvas.captureStream(30);
    ctx.fillRect(0, 0, 640, 480);
    video.srcObject = stream;
    await video.play();
    let previous = performance.now(),
      ended = false,
      frameId = 0;
    const gaps = [],
      rows = [];
    let maximumInFlight = 0;
    try {
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => {
          ended = true;
          reject(Error("Worker inference timed out"));
        }, 30000);
        const tick = (time) => {
          if (ended) return;
          gaps.push(time - previous);
          previous = time;
          ctx.fillStyle = `hsl(${time % 360},30%,15%)`;
          ctx.fillRect(0, 0, 640, 480);
          try {
            const observation = inference.detectForVideo(video, time);
            maximumInFlight = Math.max(
              maximumInFlight,
              inference.diagnostics.inFlight,
            );
            if (observation)
              rows.push({
                ...inference.diagnostics,
                sourceAgeMs: performance.now() - observation.capturedAt,
                hands: observation.landmarks.length,
              });
            if (rows.length >= 8) {
              ended = true;
              clearTimeout(deadline);
              resolve();
              return;
            }
          } catch (e) {
            ended = true;
            clearTimeout(deadline);
            reject(e);
            return;
          }
          frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
      });
    } finally {
      cancelAnimationFrame(frameId);
      inference.close();
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    const sorted = gaps.slice(2).sort((a, b) => a - b);
    return {
      environment:
        "Chromium SwiftShader, real MediaPipe CPU model in worker, synthetic 640×480 frames; isolated input probe, no universe rendering",
      maximumInFlight,
      renderCallbacks: gaps.length,
      mainRafGapMedianMs: sorted[Math.floor(sorted.length * 0.5)],
      mainRafGapP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      rows,
    };
  });
  if (
    result.maximumInFlight !== 1 ||
    result.rows.length !== 8 ||
    result.renderCallbacks < 30
  )
    throw Error("Worker isolation or completion check failed");
  await writeFile(
    "docs/measurements/worker-inference.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(result);
} finally {
  await browser.close();
}
