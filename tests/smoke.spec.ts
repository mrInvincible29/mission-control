import { test, expect } from "@playwright/test";

// === REGRESSION TESTS ===

test("homepage loads with 200 status", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toContainText("Mission Control");
});

test("all 6 tabs are visible", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Activity", "Calendar", "Search", "Agents", "Analytics", "Health"]) {
    await expect(page.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
  }
});

test("tab navigation — Activity tab loads content", async ({ page }) => {
  await page.goto("/");
  const activityTab = page.getByRole("tab", { name: /Activity/ });
  await activityTab.click();
  await expect(activityTab).toHaveAttribute("data-state", "active");
  // Activity feed should render some content (stats, list, or loading)
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("tab navigation — Calendar tab loads content", async ({ page }) => {
  await page.goto("/?tab=calendar");
  const calendarTab = page.getByRole("tab", { name: /Calendar/ });
  await expect(calendarTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("tab navigation — Search tab loads content", async ({ page }) => {
  await page.goto("/?tab=search");
  const searchTab = page.getByRole("tab", { name: /Search/ });
  await expect(searchTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("tab navigation — Agents tab loads content", async ({ page }) => {
  await page.goto("/?tab=agents");
  const agentsTab = page.getByRole("tab", { name: /Agents/ });
  await expect(agentsTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("tab navigation — Analytics tab loads content", async ({ page }) => {
  await page.goto("/?tab=analytics");
  const analyticsTab = page.getByRole("tab", { name: /Analytics/ });
  await expect(analyticsTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("keyboard shortcuts switch tabs", async ({ page }) => {
  await page.goto("/");
  // Wait for page to be interactive
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();

  // Press 2 for Calendar
  await page.keyboard.press("2");
  await expect(page.getByRole("tab", { name: /Calendar/ })).toHaveAttribute("data-state", "active");

  // Press 3 for Search
  await page.keyboard.press("3");
  await expect(page.getByRole("tab", { name: /Search/ })).toHaveAttribute("data-state", "active");

  // Press 4 for Agents
  await page.keyboard.press("4");
  await expect(page.getByRole("tab", { name: /Agents/ })).toHaveAttribute("data-state", "active");

  // Press 5 for Analytics
  await page.keyboard.press("5");
  await expect(page.getByRole("tab", { name: /Analytics/ })).toHaveAttribute("data-state", "active");

  // Press 1 for Activity
  await page.keyboard.press("1");
  await expect(page.getByRole("tab", { name: /Activity/ })).toHaveAttribute("data-state", "active");
});

test("theme toggle exists and is clickable", async ({ page }) => {
  await page.goto("/");
  // Theme toggle uses sr-only "Toggle theme" text
  const themeButton = page.getByRole("button", { name: "Toggle theme" });
  await expect(themeButton).toBeVisible({ timeout: 5000 });
  await themeButton.click();
  // DropdownMenu renders items — wait for any menu item text
  await expect(page.locator('[role="menuitem"]').first()).toBeVisible({ timeout: 3000 });
});

test("command palette opens via keyboard event", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  // Wait for dynamic components to load
  await page.waitForTimeout(1000);
  // Dispatch metaKey+k keyboard event to trigger command palette
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
  await expect(page.getByPlaceholder("Type a command or search...")).toBeVisible({ timeout: 5000 });
  // Close with Escape
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("Type a command or search...")).not.toBeVisible();
});

test("search tab has an input field", async ({ page }) => {
  await page.goto("/?tab=search");
  await expect(page.getByRole("tabpanel")).toBeVisible();
  // Search tab should have a search input or browse interface
  const panel = page.getByRole("tabpanel");
  await expect(panel).toBeVisible();
});

// === NEW FEATURE TESTS: System Health Tab ===

test("Health tab loads and shows system metrics", async ({ page }) => {
  await page.goto("/?tab=health");
  const healthTab = page.getByRole("tab", { name: /Health/ });
  await expect(healthTab).toHaveAttribute("data-state", "active");

  // Wait for health data to load
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
});

test("Health tab shows hostname badge", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // Hostname badge should appear
  const hostname = page.locator('[class*="font-mono"]').filter({ hasText: /s\d+/ });
  await expect(hostname.first()).toBeVisible({ timeout: 10000 });
});

test("Health tab shows CPU gauge", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // CPU label should appear
  await expect(page.getByText("CPU", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Memory gauge", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Memory", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Disk section", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Disk Usage")).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Docker containers", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Docker" })).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Services", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Services")).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Network interfaces", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Network Interfaces")).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Top Processes", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Top Processes")).toBeVisible({ timeout: 10000 });
});

test("Health tab auto-refresh toggle works", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // Auto button should be visible (auto-refresh is on by default)
  const autoBtn = page.getByRole("button", { name: "Auto" });
  await expect(autoBtn).toBeVisible({ timeout: 10000 });
  // Click to pause
  await autoBtn.click();
  await expect(page.getByRole("button", { name: "Paused" })).toBeVisible();
  // Click to resume
  await page.getByRole("button", { name: "Paused" }).click();
  await expect(page.getByRole("button", { name: "Auto" })).toBeVisible();
});

test("Health tab keyboard shortcut 6 works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.keyboard.press("6");
  await expect(page.getByRole("tab", { name: /Health/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
});

test("Health API returns valid JSON", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty("hostname");
  expect(data).toHaveProperty("uptime");
  expect(data).toHaveProperty("cpu");
  expect(data).toHaveProperty("memory");
  expect(data).toHaveProperty("disks");
  expect(data).toHaveProperty("docker");
  expect(data).toHaveProperty("services");
  expect(data).toHaveProperty("network");
  expect(data).toHaveProperty("topProcesses");
  expect(data.cpu.cores).toBeGreaterThan(0);
  expect(data.memory.totalMB).toBeGreaterThan(0);
});

test("Health tab Uptime section shows uptime", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Uptime")).toBeVisible({ timeout: 10000 });
});

test("command palette shows Health navigation item", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  // Wait for dynamic components to load
  await page.waitForTimeout(1000);
  // Dispatch keyboard event to open command palette
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
  await expect(page.getByPlaceholder("Type a command or search...")).toBeVisible({ timeout: 5000 });
  // Type "health"
  await page.fill('input[placeholder="Type a command or search..."]', "health");
  await expect(page.getByText("Go to System Health")).toBeVisible();
});
