import { test, expect } from "@playwright/test";
test("creates stars, loads physical systems, pauses and clears without rebuilding the universe", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore with mouse" }).click();
  const canvas = await page.locator("canvas").elementHandle();
  await page
    .getByRole("button", { name: "Celestial systems", exact: true })
    .click();
  await page.getByRole("button", { name: "Binary stars" }).click();
  await expect(page.locator(".body-count")).toContainText("2 STARS");
  await page.getByRole("button", { name: "Three-body motion" }).click();
  await expect(page.locator(".body-count")).toContainText("3 STARS");
  await page.getByRole("button", { name: /^Gravitational slingshot/ }).click();
  await expect(page.locator(".body-count")).toContainText("1 STAR");
  await page.getByRole("button", { name: "Clear stars", exact: true }).click();
  await expect(page.locator(".body-count")).toHaveCount(0);
  await page.getByRole("slider", { name: "New star mass" }).fill("30");
  await page.getByRole("button", { name: "Place a star" }).click();
  await page.getByRole("button", { name: "Close systems" }).click();
  await page.locator("canvas").click({ position: { x: 600, y: 300 } });
  await expect(page.locator(".body-count")).toContainText("1 STAR");
  await page.keyboard.press("b");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".state")).toContainText("TIME SUSPENDED");
  await page.screenshot({ path: "test-results/binary-system.png" });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset universe", exact: true })
    .click();
  await expect(page.locator(".body-count")).toHaveCount(0);
  expect(
    await canvas!.evaluate((c) => c === document.querySelector("canvas")),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("GPU dust responds to moving body fields as well as the independent hand fields", async ({
  page,
}) => {
  await page.route("**/body-probe", (r) =>
    r.fulfill({ contentType: "text/html", body: "<html><body></body></html>" }),
  );
  await page.goto("/body-probe");
  const result = await page.evaluate(async () => {
    const { Galaxy } = await import("/src/particles/Galaxy.ts");
    const THREE = await import("/node_modules/three/build/three.module.js");
    const renderer = new THREE.WebGLRenderer();
    const galaxy = new Galaxy(renderer, 16);
    const input = { fields: [], active: false, expansion: 0 };
    for (let i = 0; i < 120; i++) galaxy.step(1 / 120, input);
    const free = galaxy.sample();
    galaxy.reset();
    for (let i = 0; i < 120; i++)
      galaxy.step(1 / 120, input, [
        { position: [i / 120, 0, 0], strength: 192, radius: 8, creation: 0 },
      ]);
    const attracted = galaxy.sample();
    galaxy.dispose();
    renderer.dispose();
    return {
      finite: attracted.every(Number.isFinite),
      difference: free.reduce(
        (s: number, v: number, i: number) => s + Math.abs(v - attracted[i]),
        0,
      ),
    };
  });
  expect(result.finite).toBe(true);
  expect(result.difference).toBeGreaterThan(0.1);
});
