import { test, expect } from "@playwright/test";

// === SERVICES API TESTS ===

test("Services API returns valid JSON array", async ({ request }) => {
  const response = await request.get("/api/services");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(Array.isArray(data)).toBe(true);
  expect(data.length).toBeGreaterThan(0);
  // Each service should have required fields
  for (const svc of data) {
    expect(svc).toHaveProperty("name");
    expect(svc).toHaveProperty("url");
    expect(svc).toHaveProperty("category");
    expect(svc).toHaveProperty("status");
    expect(svc).toHaveProperty("responseTime");
  }
});

test("Services API returns Cache-Control no-cache header", async ({ request }) => {
  const response = await request.get("/api/services");
  expect(response.status()).toBe(200);
  const cacheControl = response.headers()["cache-control"];
  expect(cacheControl).toContain("no-cache");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).toContain("must-revalidate");
});

test("Services API includes known services", async ({ request }) => {
  const response = await request.get("/api/services");
  const data = await response.json();
  const names = data.map((s: any) => s.name);
  expect(names).toContain("Mission Control");
  expect(names).toContain("Status Page");
  expect(names).toContain("Companion");
});

// === SERVICES SUB-VIEW UI TESTS ===

test("Services sub-view loads via URL /?tab=system&view=services", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  const systemTab = page.getByRole("tab", { name: /System/ });
  await expect(systemTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("Services sub-view shows Services Directory header", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  await expect(page.getByText("Services Directory")).toBeVisible({ timeout: 10000 });
});

test("Services sub-view renders cards with names and URLs", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  await expect(page.getByText("Services Directory")).toBeVisible({ timeout: 10000 });
  // Should show at least Mission Control and Status Page
  await expect(page.getByText("Mission Control").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Status Page").first()).toBeVisible({ timeout: 10000 });
});

test("Services sub-view shows health status dots", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  await expect(page.getByText("Services Directory")).toBeVisible({ timeout: 10000 });
  // Health dots: green (bg-emerald-500), amber (bg-amber-500), or red (bg-red-500)
  const dots = page.locator('[data-testid="service-status-dot"]');
  await expect(dots.first()).toBeVisible({ timeout: 10000 });
});

test("Services sub-view URLs have target=_blank", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  await expect(page.getByText("Services Directory")).toBeVisible({ timeout: 10000 });
  // All external links should open in new tab
  const links = page.locator('a[target="_blank"]');
  await expect(links.first()).toBeVisible({ timeout: 10000 });
  const href = await links.first().getAttribute("href");
  expect(href).toContain("quota.wtf");
});

test("Services sub-view filter narrows visible cards", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  await expect(page.getByText("Services Directory")).toBeVisible({ timeout: 10000 });
  // Wait for cards to render
  await expect(page.getByText("Mission Control").first()).toBeVisible({ timeout: 10000 });

  // Count initial cards
  const cards = page.locator('[data-testid="service-card"]');
  const initialCount = await cards.count();
  expect(initialCount).toBeGreaterThan(1);

  // Type a filter that should narrow results
  const filterInput = page.getByPlaceholder("Filter services...");
  await expect(filterInput).toBeVisible();
  await filterInput.fill("monitoring");
  await page.waitForTimeout(300);

  // Filtered count should be less than initial
  const filteredCount = await cards.count();
  expect(filteredCount).toBeLessThan(initialCount);
  expect(filteredCount).toBeGreaterThan(0);
});

test("command palette shows Services Directory navigation item", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  });
  await expect(page.getByPlaceholder("search files")).toBeVisible({ timeout: 5000 });
  await page.fill('input[placeholder*="search files"]', "services");
  await expect(page.getByText("Services Directory")).toBeVisible();
});
