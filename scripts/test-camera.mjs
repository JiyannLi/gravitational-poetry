import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
const model = process.env.HAND_MODEL_PATH;
if (!model)
  throw new Error(
    "Set HAND_MODEL_PATH to the official hand_landmarker.task file. Start npm run preview first.",
  );
await access(model);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH === "bundled"
      ? undefined
      : process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.handWorkerResults = 0;
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", ({ data }) => {
          if (data.type === "result") window.handWorkerResults++;
        });
      }
    };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .context()
    .route("https://storage.googleapis.com/**", (route) =>
      route.fulfill({ path: model, contentType: "application/octet-stream" }),
    );
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:4173");
  await page
    .getByRole("button", { name: "Enable camera", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disable camera", exact: true })
    .waitFor({ timeout: 30000 });
  await page.waitForFunction(() => window.handWorkerResults > 0, null, {
    timeout: 30000,
  });
  assert.equal(await page.getByRole("alert").count(), 0);
  await page
    .getByRole("button", { name: "Disable camera", exact: true })
    .click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real MediaPipe worker initialization, completed synthetic-frame inference, and camera stop. Real-hand accuracy is not covered.",
  );
} finally {
  await browser.close();
}
