import { test, expect } from "@playwright/test";
test("particle preview transfers once, keeps its pose, morphs on GPU and cleans up", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/morph-probe", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<style>body{margin:0}</style><div id="host" style="width:800px;height:600px"></div>',
    }),
  );
  await page.goto("/morph-probe");
  const result = await page.evaluate(async () => {
    const { Universe } = await import("/src/scene/Universe.ts");
    const { Hands } = await import("/src/gestures/Hands.ts");
    const u = new Universe(
      document.getElementById("host"),
      () => {},
      console.error,
    );
    cancelAnimationFrame(u.frame);
    u.camera.position.z = 20;
    u.galaxy.points.visible = false;
    u.galaxy.trails.visible = false;
    let now = 1000;
    const tick = () => {
      u.tick((now += 1000 / 60));
      cancelAnimationFrame(u.frame);
    };
    // Inject landmark results, exercising the real Hands → preview → physics chain.
    const hands = new Hands();
    let pinch = 0.9;
    let tracked = true;
    const landmarks = Array.from({ length: 21 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    landmarks[0] = { x: 0.5, y: 0.7, z: 0 };
    landmarks[9] = { x: 0.5, y: 0.5, z: 0 };
    landmarks[4] = { x: 0.5, y: 0.4, z: 0 };
    hands.video = {
      readyState: 4,
      get currentTime() {
        return now / 1000;
      },
      pause() {},
    };
    hands.stream = {
      getVideoTracks: () => [{ readyState: "live" }],
      getTracks: () => [],
    };
    hands.model = {
      detectForVideo() {
        landmarks[8] = { x: 0.5 + 0.2 * (1 - pinch), y: 0.4, z: 0 };
        return {
          landmarks: tracked ? [landmarks] : [],
          handedness: [[{ score: 1, categoryName: "Left" }]],
        };
      },
      close() {},
    };
    u.hands = hands;
    tick();
    const immediate = !!u.celestial.preview;
    const during = [];
    for (let i = 0; i < 48; i++) {
      tick();
      during.push(u.bodies.starCount);
    }
    const preview = u.celestial.preview,
      points = preview.points,
      radius = points.material.uniforms.radius.value;
    const position = points.position.toArray();
    const beforeTime = points.material.uniforms.time.value;
    pinch = 0.1;
    for (let i = 0; i < 6; i++) tick();
    const body = u.bodies.bodies[0],
      view = u.celestial.views.get(body.id);
    const transferred = view.surface.points === points;
    const poseDelta = body.position.map((v, i) => v - position[i]);
    const afterRadius = points.material.uniforms.radius.value;
    const afterTime = points.material.uniforms.time.value;
    for (let i = 0; i < 12; i++) tick();
    const once = u.bodies.starCount;
    pinch = 0.9;
    for (let i = 0; i < 45; i++) tick();
    tracked = false;
    for (let i = 0; i < 30; i++) tick();
    const cancelled = !u.celestial.preview;
    u.disableCamera();
    u.paused = true;
    // Rendering rotations/shape response separately from body inertia.
    u.paused = false;
    u.speed = 0;
    let ring90 = 0,
      nebula90 = 0;
    u.setShape("ring");
    for (let i = 1; i <= 30; i++) {
      tick();
      if (!ring90 && view.surface.points.material.uniforms.ringMix.value >= 0.9)
        ring90 = (i * 1000) / 60;
    }
    const ringGeometry = view.surface.points.geometry;
    const versions = Object.values(ringGeometry.attributes).map(
      (a) => a.version,
    );
    u.setShape("nebula");
    for (let i = 1; i <= 30; i++) {
      tick();
      if (
        !nebula90 &&
        view.surface.points.material.uniforms.nebulaMix.value >= 0.9
      )
        nebula90 = (i * 1000) / 60;
    }
    u.setShape("ring");
    for (let i = 0; i < 30; i++) tick();
    Object.assign(window, { morphUniverse: u });
    return {
      immediate,
      during,
      transferred,
      poseDelta,
      radius,
      afterRadius,
      beforeTime,
      afterTime,
      once,
      cancelled,
      ring90,
      nebula90,
      versions,
      geometryCount: ringGeometry.getAttribute("position").count,
      shape: u.celestial.shape,
    };
  });
  expect(result.immediate).toBe(true);
  expect(result.during.every((n) => n === 0)).toBe(true);
  expect(result.transferred).toBe(true);
  expect(Math.hypot(...result.poseDelta)).toBeLessThan(0.02);
  expect(result.afterRadius).toBe(result.radius);
  expect(result.afterTime - result.beforeTime).toBeGreaterThanOrEqual(0);
  expect(result.afterTime - result.beforeTime).toBeLessThan(0.2);
  expect(result.once).toBe(1);
  expect(result.cancelled).toBe(true);
  expect(result.versions.every((n) => n === 0)).toBe(true);
  expect(result.ring90).toBeLessThanOrEqual(220);
  expect(result.nebula90).toBeLessThanOrEqual(150);
  await testInfo.attach("morph-response", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: "test-results/particle-ring.png" });
  const remaining = await page.evaluate(() => {
    window.morphUniverse.dispose();
    return document.querySelectorAll("canvas").length;
  });
  expect(remaining).toBe(0);
  expect(errors).toEqual([]);
});

test("pointer long-press forms a body and shape controls preserve the existing universe", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore with mouse" }).click();
  await page.keyboard.press("s");
  await page.getByRole("button", { name: "Close systems" }).click();
  const canvas = await page.locator("canvas").elementHandle();
  await page.mouse.move(760, 320);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await expect(page.locator(".body-count")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".body-count")).toContainText("1 STAR");
  await page
    .getByRole("button", { name: "Celestial systems", exact: true })
    .click();
  await page.getByRole("button", { name: "Ring", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ring", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({ path: "test-results/particle-controls.png" });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Nebula", exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Sphere", exact: true }).click();
  await expect(page.locator(".body-count")).toContainText("1 STAR");
  expect(
    await canvas!.evaluate((c) => c === document.querySelector("canvas")),
  ).toBe(true);
  expect(errors).toEqual([]);
});
