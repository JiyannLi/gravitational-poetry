import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1.5 });

test("startup and sustained low FPS preserve particle state and never present a cleared canvas", async ({
  page,
}) => {
  test.setTimeout(120000);
  // Isolate the actual Universe from UI. A controlled clock reliably exercises
  // the former quality thresholds on both fast and software GPUs, with no production hooks.
  await page.route("**/visual-probe", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<div id="host" style="width:640px;height:480px"></div>',
    }),
  );
  await page.goto("/visual-probe");
  const results = await page.evaluate(async () => {
    let seed = 1234;
    Math.random = () =>
      (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
    const { Universe } = await import("/src/scene/Universe.ts");
    const failures: string[] = [];
    const host = document.getElementById("host")!;
    const u = new Universe(
      host,
      () => {},
      (message: string) => failures.push(message),
    );
    cancelAnimationFrame(u.frame);
    // Freeze physical time only, not quality decisions, to isolate rendering changes.
    u.speed = 0;
    const original = u.galaxy;
    const initial = original.sample();
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("2d")!;
    function read() {
      probe.width = u.renderer.domElement.width;
      probe.height = u.renderer.domElement.height;
      ctx.drawImage(u.renderer.domElement, 0, 0);
      const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
      let light = 0;
      for (let i = 0; i < pixels.length; i += 4)
        light +=
          0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      return light / (probe.width * probe.height);
    }
    const rows = [];
    for (let i = 0; i < 36; i++) {
      u.tick(100 + i * 1000);
      cancelAnimationFrame(u.frame);
      rows.push({
        light: read(),
        sameGalaxy: u.galaxy === original,
        count: u.galaxy.count,
        ratio: u.renderer.getPixelRatio(),
        composerRatio: u.composer._pixelRatio,
        shaderRatio: u.galaxy.points.material.uniforms.pixelRatio.value,
        exposure: u.renderer.toneMappingExposure,
        bloom: u.bloom.strength,
      });
    }
    const frozen = original.sample();
    // Resize must not clear the last presented frame between browser callbacks.
    const beforeResize = read();
    host.style.width = "600px";
    host.style.height = "450px";
    window.dispatchEvent(new Event("resize"));
    const queuedResize = read();
    u.tick(36100);
    cancelAnimationFrame(u.frame);
    const resized = read();
    Object.defineProperty(window, "devicePixelRatio", {
      value: 2,
      configurable: true,
    });
    u.tick(36150);
    cancelAnimationFrame(u.frame);
    const monitorRatio = {
      renderer: u.renderer.getPixelRatio(),
      composer: u.composer._pixelRatio,
      shader: u.galaxy.points.material.uniforms.pixelRatio.value,
    };
    const size = {
      width: u.renderer.domElement.width,
      height: u.renderer.domElement.height,
      composerWidth: u.composer.readBuffer.width,
      composerHeight: u.composer.readBuffer.height,
    };
    u.speed = 1;
    for (let i = 0; i < 40; i++) {
      u.tick(36200 + i * 50);
      cancelAnimationFrame(u.frame);
    }
    const evolved = original.sample();
    const finalLight = read();
    u.dispose();
    return {
      rows,
      monitorRatio,
      initial,
      frozen,
      evolved,
      beforeResize,
      queuedResize,
      resized,
      size,
      finalLight,
      failures,
      remainingCanvases: host.querySelectorAll("canvas").length,
    };
  });
  expect(results.failures).toEqual([]);
  expect(results.monitorRatio).toEqual({
    renderer: 1.75,
    composer: 1.75,
    shader: 1.75,
  });
  expect(results.remainingCanvases).toBe(0);
  expect(results.rows.every((r) => r.sameGalaxy && r.count === 65536)).toBe(
    true,
  );
  expect(results.frozen).toEqual(results.initial);
  expect(results.evolved.every(Number.isFinite)).toBe(true);
  expect(results.evolved).not.toEqual(results.initial);
  // Particle color/alpha seeds do not expire as the universe evolves.
  expect(results.evolved.filter((_, i) => i % 4 === 3)).toEqual(
    results.initial.filter((_, i) => i % 4 === 3),
  );
  expect(results.rows[0].light).toBeGreaterThan(10);
  expect(results.rows[1].light / results.rows[0].light).toBeCloseTo(1, 3);
  for (const [i, row] of results.rows.entries()) {
    expect(row.light / results.rows[0].light).toBeGreaterThan(0.99);
    expect(row.light / results.rows[0].light).toBeLessThan(1.01);
    if (i)
      expect(Math.abs(row.light / results.rows[i - 1].light - 1)).toBeLessThan(
        0.01,
      );
    expect(row.composerRatio).toBe(row.ratio);
    expect(row.shaderRatio).toBe(row.ratio);
    expect(row.exposure).toBe(1.1);
    expect(row.bloom).toBe(0.62);
  }
  expect(results.rows.every((row) => row.ratio === results.rows[0].ratio)).toBe(
    true,
  );
  expect(results.queuedResize).toBe(results.beforeResize);
  expect(results.resized).toBeGreaterThan(10);
  expect(results.finalLight).toBeGreaterThan(10);
  expect(
    Math.abs(results.size.width - results.size.composerWidth),
  ).toBeLessThan(1);
  expect(
    Math.abs(results.size.height - results.size.composerHeight),
  ).toBeLessThan(1);
});

test("real page survives refresh, resize and delayed/failed camera model loading without replacing its canvas", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window),
      cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set<number>();
    Object.assign(window, { pendingUniverseFrames: pending });
    window.requestAnimationFrame = (callback) => {
      const id = request((time) => {
        pending.delete(id);
        callback(time);
      });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
      cancel(id);
    };
    // A synthetic camera lets us exercise the real model-loading path without
    // permissions or real hardware. The deliberately failed model is not inference validation.
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 120;
      c.getContext("2d")!.fillRect(0, 0, 160, 120);
      return c.captureStream(15);
    };
  });
  let releaseModel!: () => void;
  const modelBlocked = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  let modelRequested!: () => void;
  const modelStarted = new Promise<void>((resolve) => {
    modelRequested = resolve;
  });
  await page.route("https://storage.googleapis.com/**", async (route) => {
    modelRequested();
    await modelBlocked;
    await route.fulfill({ status: 503, body: "Controlled model failure" });
  });
  const read = () =>
    page.evaluate(() => {
      const source = document.querySelector("canvas")!;
      const c = document.createElement("canvas");
      c.width = source.width;
      c.height = source.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(source, 0, 0);
      const p = ctx.getImageData(0, 0, c.width, c.height).data;
      let l = 0;
      for (let i = 0; i < p.length; i += 4) l += p[i] + p[i + 1] + p[i + 2];
      return {
        light: l / (c.width * c.height * 3),
        pending: (window as any).pendingUniverseFrames.size,
      };
    });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect
    .poll(async () => (await read()).light, { timeout: 15000 })
    .toBeGreaterThan(10);
  await page.reload();
  await expect
    .poll(async () => (await read()).light, { timeout: 15000 })
    .toBeGreaterThan(10);
  const canvas = await page.locator("canvas").elementHandle();
  const baseline = await read();
  expect(baseline.pending).toBe(1);
  await page.setViewportSize({ width: 900, height: 650 });
  await expect
    .poll(async () => (await read()).light, { timeout: 15000 })
    .toBeGreaterThan(10);
  await page
    .getByRole("button", { name: "Enable camera", exact: true })
    .click();
  await modelStarted;
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(250);
    const frame = await read();
    expect(frame.light).toBeGreaterThan(baseline.light * 0.65);
    expect(frame.pending).toBe(1);
  }
  releaseModel();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Enable camera", exact: true }),
  ).toBeEnabled();
  expect((await read()).light).toBeGreaterThan(baseline.light * 0.65);
  expect(
    await canvas!.evaluate((c) => c === document.querySelector("canvas")),
  ).toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/stable-startup.png" });
});
