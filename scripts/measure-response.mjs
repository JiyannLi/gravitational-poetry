// Run against the dev server. Controlled inputs measure control dynamics, not camera accuracy.
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.route("**/response-probe", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<div id="host" style="width:640px;height:480px"></div>',
    }),
  );
  await page.goto("http://127.0.0.1:5173/response-probe");
  const result = await page.evaluate(async () => {
    const { Universe } = await import("/src/scene/Universe.ts");
    const { HandInference } = await import("/src/gestures/HandInference.ts");
    let calls = 0;
    const RealWorker = window.Worker,
      realBitmap = window.createImageBitmap;
    window.Worker = class {
      onmessage = null;
      postMessage(data) {
        if (data.type === "init")
          queueMicrotask(() => this.onmessage({ data: { type: "ready" } }));
        else {
          calls++;
          queueMicrotask(() =>
            this.onmessage({
              data: {
                type: "result",
                result: { landmarks: [], handedness: [] },
                capturedAt: data.capturedAt,
                inferenceMs: 0,
              },
            }),
          );
        }
      }
      terminate() {}
    };
    window.createImageBitmap = async () => ({ close() {} });
    const inference = new HandInference();
    await inference.start("/", "/mock");
    for (let i = 0; i <= 60; i++) {
      inference.detectForVideo({ currentTime: i / 60 }, 1000 + (i * 1000) / 60);
      await Promise.resolve();
      await Promise.resolve();
    }
    inference.close();
    window.Worker = RealWorker;
    window.createImageBitmap = realBitmap;
    const u = new Universe(
      document.getElementById("host"),
      () => {},
      () => {},
    );
    cancelAnimationFrame(u.frame);
    u.paused = true;
    u.pointer.read = () => ({
      active: true,
      expansion: 0,
      fields: [{ position: [10, 0, 0], strength: 30, radius: 8, creation: 1 }],
    });
    let position90 = null,
      strength90 = null;
    for (let i = 0; i <= 60; i++) {
      u.tick(1000 + (i * 1000) / 60);
      cancelAnimationFrame(u.frame);
      if (position90 === null && u.input.fields[0].position[0] >= 9)
        position90 = (i * 1000) / 60;
      if (strength90 === null && u.input.fields[0].strength >= 27)
        strength90 = (i * 1000) / 60;
    }
    // Small stationary jitter versus fast control movement, both normalized in world units.
    let raw = [],
      filtered = [];
    for (let i = 0; i < 120; i++) {
      const x = 10 + (i % 2 === 0 ? 0.05 : -0.05);
      u.pointer.read = () => ({
        active: true,
        expansion: 0,
        fields: [{ position: [x, 0, 0], strength: 30, radius: 8, creation: 0 }],
      });
      u.tick(2100 + (i * 1000) / 60);
      cancelAnimationFrame(u.frame);
      if (i > 30) {
        raw.push(x - 10);
        filtered.push(u.input.fields[0].position[0] - 10);
      }
    }
    const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const response = {
      environment:
        "Headless Chromium / SwiftShader, 640×480, controlled 60 Hz clock; synthetic input, no camera",
      inferenceSchedulingCallsPerSecond: calls - 1,
      position90Ms: position90,
      fieldStrength90Ms: strength90,
      stationaryRawRms: rms(raw),
      stationaryFilteredRms: rms(filtered),
    };
    u.dispose();
    return response;
  });
  await writeFile(
    "docs/measurements/response-after.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(result);
} finally {
  await browser.close();
}
