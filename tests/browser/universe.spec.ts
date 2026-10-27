import { test, expect } from "@playwright/test";
test("renders a live GPU universe and supports pointer, time, settings and capture", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your universe awaits." }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Explore with mouse" }).click();
  await page.mouse.move(700, 320);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.locator(".state")).toContainText("RESONANCE");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".state")).toContainText("TIME SUSPENDED");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("slider", { name: "Time flow" }).fill("1.5");
  await expect(page.locator("output").first()).toHaveText("1.5×");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.keyboard.press("c");
  await expect(page.getByTitle("Create nebula (C)")).toHaveClass("selected");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Screenshot", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("gravitational-poetry.png");
  await page
    .getByRole("button", { name: "Reset universe", exact: true })
    .click();
  await page.screenshot({ path: "test-results/universe-desktop.png" });
  expect(errors).toEqual([]);
});
test("camera denial leaves mouse controls usable", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enable camera", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Explore with mouse" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".state")).toContainText("TIME SUSPENDED");
});
test("mobile touch viewport keeps controls accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore with mouse" }).click();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "test-results/universe-mobile.png" });
});
test("GPU integration remains finite and responds to gravity rather than preset animation", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // Vite serves the real simulation module, including its GLSL computation passes.
    const { Galaxy } = await import("/src/particles/Galaxy.ts");
    const THREE = await import("/node_modules/three/build/three.module.js");
    const renderer = new THREE.WebGLRenderer();
    const galaxy = new Galaxy(renderer, 16);
    for (let i = 0; i < 120; i++)
      galaxy.step(1 / 120, { fields: [], active: false, expansion: 0 });
    const free = galaxy.sample();
    galaxy.reset();
    for (let i = 0; i < 120; i++)
      galaxy.step(1 / 120, {
        fields: [{ position: [0, 0, 0], strength: 80, creation: 0, radius: 8 }],
        active: true,
        expansion: 0,
      });
    const pulled = galaxy.sample();
    galaxy.dispose();
    renderer.dispose();
    return {
      finite: pulled.every(Number.isFinite),
      difference: free.reduce(
        (s: number, v: number, i: number) => s + Math.abs(v - pulled[i]),
        0,
      ),
    };
  });
  expect(result.finite).toBe(true);
  expect(result.difference).toBeGreaterThan(0.01);
});
