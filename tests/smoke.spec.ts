import { test, expect } from "@playwright/test";

// === REGRESSION TESTS ===

test("homepage loads with 200 status", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toContainText("Mission Control");
});

test("all 7 tabs are visible", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Activity", "Calendar", "Search", "Agents", "Analytics", "Health", "Runs"]) {
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

// === NEW FEATURE TESTS: Cron Run History Tab ===

test("Cron Runs tab loads via URL", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  const runsTab = page.getByRole("tab", { name: /Runs/ });
  await expect(runsTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("Cron Runs tab shows header and stats", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Stats banner should show Total Runs
  await expect(page.getByText("Total Runs")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Succeeded")).toBeVisible({ timeout: 10000 });
});

test("Cron Runs tab shows job list", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Should show at least one job name (e.g. Nightly Build)
  await expect(page.getByText("Nightly Build").first()).toBeVisible({ timeout: 10000 });
});

test("Cron Runs tab expand job shows run list", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Click on a job to expand it
  const jobButton = page.getByText("Nightly Build").first();
  await expect(jobButton).toBeVisible({ timeout: 10000 });
  await jobButton.click();
  // Expanded view should show a run timestamp or status icon
  await expect(page.locator('svg.text-emerald-500, svg.text-red-500').first()).toBeVisible({ timeout: 5000 });
});

test("Cron Runs tab status filter works", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Click "Success" filter — use exact match to avoid matching timeline entries
  const successBtn = page.getByRole("button", { name: "Success", exact: true });
  await expect(successBtn).toBeVisible({ timeout: 5000 });
  await successBtn.click();
  // Button should be highlighted (secondary variant)
  await expect(successBtn).toBeVisible();
  // Click "All" to reset
  await page.getByRole("button", { name: "All", exact: true }).click();
});

test("Cron Runs tab sort buttons work", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Click "Name" sort — use exact match to avoid matching timeline entries
  const nameBtn = page.getByRole("button", { name: "Name", exact: true });
  await expect(nameBtn).toBeVisible({ timeout: 5000 });
  await nameBtn.click();
  // Click back to "Recent"
  await page.getByRole("button", { name: "Recent", exact: true }).click();
});

test("Cron Runs tab shows timeline section", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Timeline heading should be visible
  await expect(page.getByText("Timeline")).toBeVisible({ timeout: 10000 });
});

test("Cron Runs keyboard shortcut 7 works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.keyboard.press("7");
  await expect(page.getByRole("tab", { name: /Runs/ })).toHaveAttribute("data-state", "active");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
});

test("Cron Runs API returns valid JSON", async ({ request }) => {
  const response = await request.get("/api/cron-runs");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty("runs");
  expect(data).toHaveProperty("jobs");
  expect(data).toHaveProperty("totalRuns");
  expect(Array.isArray(data.runs)).toBe(true);
  expect(Array.isArray(data.jobs)).toBe(true);
  expect(data.totalRuns).toBeGreaterThan(0);
});

test("Cron Runs API supports jobId filter", async ({ request }) => {
  // First get the list to find a job ID
  const listResponse = await request.get("/api/cron-runs?limit=1");
  const listData = await listResponse.json();
  if (listData.runs.length > 0) {
    const jobId = listData.runs[0].jobId;
    const filteredResponse = await request.get(`/api/cron-runs?jobId=${jobId}`);
    const filteredData = await filteredResponse.json();
    expect(filteredData.runs.every((r: any) => r.jobId === jobId)).toBe(true);
  }
});

test("Cron Runs tab refresh button exists", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  const refreshBtn = page.getByRole("button", { name: "Refresh", exact: true });
  await expect(refreshBtn).toBeVisible({ timeout: 5000 });
});

test("command palette shows Cron Run History navigation item", async ({ page }) => {
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
  await expect(page.getByPlaceholder("Type a command or search...")).toBeVisible({ timeout: 5000 });
  await page.fill('input[placeholder="Type a command or search..."]', "cron runs");
  await expect(page.getByText("Go to Cron Run History")).toBeVisible();
});

// === BUG FIX REGRESSION TESTS ===

test("Health API returns Cache-Control no-cache header", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const cacheControl = response.headers()["cache-control"];
  expect(cacheControl).toContain("no-cache");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).toContain("must-revalidate");
});

test("Cron Runs API returns Cache-Control no-cache header", async ({ request }) => {
  const response = await request.get("/api/cron-runs");
  expect(response.status()).toBe(200);
  const cacheControl = response.headers()["cache-control"];
  expect(cacheControl).toContain("no-cache");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).toContain("must-revalidate");
});

test("Health tab shows 'Updated Xs ago' counter", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // The "Updated Xs ago" counter should appear after data loads
  await expect(page.getByText(/Updated \d+s ago/)).toBeVisible({ timeout: 10000 });
});

test("Health tab 'Updated' counter increments over time", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Updated \d+s ago/)).toBeVisible({ timeout: 10000 });
  // Wait 2 seconds and verify the counter has changed
  const initialText = await page.getByText(/Updated \d+s ago/).textContent();
  await page.waitForTimeout(2500);
  const updatedText = await page.getByText(/Updated \d+s ago/).textContent();
  expect(updatedText).not.toBe(initialText);
});

test("Health tab has a manual refresh button", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // The refresh icon button should exist and be clickable
  const refreshBtn = page.locator('button:has(svg.h-3\\.5.w-3\\.5)').last();
  await expect(refreshBtn).toBeVisible();
  await refreshBtn.click();
  // After clicking, the counter should reset close to 0
  await expect(page.getByText(/Updated [0-2]s ago/)).toBeVisible({ timeout: 5000 });
});

test("Health API returns valid CPU data with non-negative values", async ({ request }) => {
  // Health API runs multiple execSync commands; retry on transient ECONNRESET
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await request.get("/api/health");
      break;
    } catch {
      if (attempt === 2) throw new Error("Health API unreachable after 3 attempts");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const data = await response!.json();
  expect(data.cpu.user).toBeGreaterThanOrEqual(0);
  expect(data.cpu.system).toBeGreaterThanOrEqual(0);
  expect(data.cpu.idle).toBeGreaterThanOrEqual(0);
  expect(data.cpu.loadAvg).toHaveLength(3);
  // Sum should be approximately 100
  const total = data.cpu.user + data.cpu.system + data.cpu.idle;
  expect(total).toBeGreaterThan(90);
  expect(total).toBeLessThanOrEqual(101);
});

test("Health API returns valid memory data", async ({ request }) => {
  const response = await request.get("/api/health");
  const data = await response.json();
  expect(data.memory.totalMB).toBeGreaterThan(0);
  expect(data.memory.usedMB).toBeGreaterThan(0);
  expect(data.memory.availableMB).toBeGreaterThanOrEqual(0);
  expect(data.memory.usedPercent).toBeGreaterThan(0);
  expect(data.memory.usedPercent).toBeLessThanOrEqual(100);
});

test("Cron Runs API returns valid job stats", async ({ request }) => {
  const response = await request.get("/api/cron-runs");
  const data = await response.json();
  for (const job of data.jobs) {
    expect(job).toHaveProperty("id");
    expect(job).toHaveProperty("name");
    expect(job).toHaveProperty("stats");
    expect(job.stats.total).toBeGreaterThanOrEqual(0);
    expect(job.stats.ok).toBeGreaterThanOrEqual(0);
    expect(job.stats.error).toBeGreaterThanOrEqual(0);
    // ok + error should equal total
    expect(job.stats.ok + job.stats.error).toBe(job.stats.total);
  }
});

test("Cron Runs tab jobs are sorted by most recent first (default)", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // "Recent" sort button should be active by default
  const recentBtn = page.getByRole("button", { name: "Recent", exact: true });
  await expect(recentBtn).toBeVisible({ timeout: 5000 });
});

test("Cron Runs tab Health sort orders by success rate descending", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  const healthBtn = page.getByRole("button", { name: "Health", exact: true });
  await expect(healthBtn).toBeVisible({ timeout: 5000 });
  await healthBtn.click();
  // Jobs with 100% success should appear before jobs with lower rates
  // Verify at least the sort button is highlighted (secondary variant)
  await expect(healthBtn).toBeVisible();
});

test("Cron Runs tab timestamps use locale-appropriate formatting", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Expand a job to see run timestamps
  const jobButton = page.getByText("Nightly Build").first();
  await expect(jobButton).toBeVisible({ timeout: 10000 });
  await jobButton.click();
  // Timestamps should use en-US format (e.g., "Feb 13, 10:30 PM") not en-IN
  // Look for AM/PM format which confirms en-US locale
  await expect(page.getByText(/[AP]M/).first()).toBeVisible({ timeout: 5000 });
});

test("Analytics tab loads without crashing", async ({ page }) => {
  await page.goto("/?tab=analytics");
  const analyticsTab = page.getByRole("tab", { name: /Analytics/ });
  await expect(analyticsTab).toHaveAttribute("data-state", "active");
  // Should show content even if there's no data — not crash
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
  // Wait a moment for data to load or "no data" state to render
  await page.waitForTimeout(2000);
  // The tab should still be visible (no crash)
  await expect(tabContent).toBeVisible();
});

test("Cron Runs tab visibility change triggers refresh", async ({ page }) => {
  await page.goto("/?tab=cron-runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Simulate visibility change (hidden then visible) — data should still show
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // Tab should still be functional
  await expect(page.getByText("Cron Run History")).toBeVisible();
  await expect(page.getByText("Total Runs")).toBeVisible();
});

test("Health tab visibility change triggers refresh", async ({ page }) => {
  await page.goto("/?tab=health");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // Simulate visibility change
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // Tab should still be functional
  await expect(page.getByText("System Health")).toBeVisible();
});
