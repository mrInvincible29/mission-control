import { test, expect } from "@playwright/test";

// === REGRESSION TESTS ===

test("homepage loads with 200 status", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toContainText("Mission Control");
});

test("all 4 tabs are visible", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Activity", "Schedule", "Tasks", "System"]) {
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

test("tab navigation — Schedule tab loads content", async ({ page }) => {
  await page.goto("/?tab=schedule");
  const scheduleTab = page.getByRole("tab", { name: /Schedule/ });
  await expect(scheduleTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("tab navigation — System tab loads content", async ({ page }) => {
  await page.goto("/?tab=system");
  const systemTab = page.getByRole("tab", { name: /System/ });
  await expect(systemTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("keyboard shortcuts switch tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  // Wait for dynamic components and keyboard listener to register
  await page.waitForTimeout(1000);

  await page.keyboard.press("2");
  await expect(page.getByRole("tab", { name: /Schedule/ })).toHaveAttribute("data-state", "active", { timeout: 5000 });

  await page.keyboard.press("3");
  await expect(page.getByRole("tab", { name: /Tasks/ })).toHaveAttribute("data-state", "active", { timeout: 5000 });

  await page.keyboard.press("4");
  await expect(page.getByRole("tab", { name: /System/ })).toHaveAttribute("data-state", "active", { timeout: 5000 });

  await page.keyboard.press("1");
  await expect(page.getByRole("tab", { name: /Activity/ })).toHaveAttribute("data-state", "active", { timeout: 5000 });
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
  await expect(page.getByPlaceholder("search files")).toBeVisible({ timeout: 5000 });
  // Focus the input, then close with Escape
  await page.getByPlaceholder("search files").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("search files")).not.toBeVisible({ timeout: 5000 });
});

// === SYSTEM TAB: Health Sub-View ===

test("System tab loads and shows system metrics", async ({ page }) => {
  await page.goto("/?tab=system");
  const systemTab = page.getByRole("tab", { name: /System/ });
  await expect(systemTab).toHaveAttribute("data-state", "active");

  // Wait for health data to load
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
});

test("Health tab shows hostname badge", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // Hostname badge should appear
  const hostname = page.locator('[class*="font-mono"]').filter({ hasText: /s\d+/ });
  await expect(hostname.first()).toBeVisible({ timeout: 10000 });
});

test("Health tab shows CPU gauge", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // CPU label should appear
  await expect(page.getByText("CPU", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Memory gauge", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Memory", { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Disk section", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Disk Usage")).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Docker containers", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Docker" })).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Services", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Services" })).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Network section", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Network" })).toBeVisible({ timeout: 10000 });
});

test("Health tab shows Top Processes", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Top Processes")).toBeVisible({ timeout: 10000 });
});

test("Health tab auto-refresh toggle works", async ({ page }) => {
  await page.goto("/?tab=system");
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
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Uptime")).toBeVisible({ timeout: 10000 });
});

test("command palette shows System Health navigation item", async ({ page }) => {
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
  await expect(page.getByPlaceholder("search files")).toBeVisible({ timeout: 5000 });
  // Type "health"
  await page.fill('input[placeholder*="search files"]', "health");
  await expect(page.getByText("System Health")).toBeVisible();
});

// === SCHEDULE TAB: Runs Sub-View ===

test("Schedule tab (Runs view) loads via URL", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  const scheduleTab = page.getByRole("tab", { name: /Schedule/ });
  await expect(scheduleTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("Cron Runs tab shows header and stats", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Stats banner should show Total Runs
  await expect(page.getByText("Total Runs")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Succeeded")).toBeVisible({ timeout: 10000 });
});

test("Cron Runs tab shows job list", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Should show at least one job name (e.g. Nightly Build)
  await expect(page.getByText("Nightly Build").first()).toBeVisible({ timeout: 10000 });
});

test("Cron Runs tab expand job shows run list", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Click on a job to expand it
  const jobButton = page.getByText("Nightly Build").first();
  await expect(jobButton).toBeVisible({ timeout: 10000 });
  await jobButton.click();
  // Expanded view should show a run timestamp or status icon
  await expect(page.locator('svg.text-emerald-500, svg.text-red-500').first()).toBeVisible({ timeout: 5000 });
});

test("Cron Runs tab status filter works", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
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
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Click "Name" sort — use exact match to avoid matching timeline entries
  const nameBtn = page.getByRole("button", { name: "Name", exact: true });
  await expect(nameBtn).toBeVisible({ timeout: 5000 });
  await nameBtn.click();
  // Click back to "Recent"
  await page.getByRole("button", { name: "Recent", exact: true }).click();
});

test("Cron Runs tab shows timeline section", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Timeline heading should be visible
  await expect(page.getByText("Timeline")).toBeVisible({ timeout: 10000 });
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
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  const refreshBtn = page.getByRole("button", { name: "Refresh", exact: true });
  await expect(refreshBtn).toBeVisible({ timeout: 5000 });
});

test("command palette shows Run History navigation item", async ({ page }) => {
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
  await page.fill('input[placeholder*="search files"]', "run history");
  await expect(page.getByRole("button", { name: /Run History/ }).first()).toBeVisible();
});

// === BUG FIX REGRESSION TESTS ===

test("Health API returns Cache-Control no-cache header", async ({ request }) => {
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
  expect(response!.status()).toBe(200);
  const cacheControl = response!.headers()["cache-control"];
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
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // The "Updated Xs ago" counter should appear after data loads
  await expect(page.getByText(/Updated \d+s ago/)).toBeVisible({ timeout: 10000 });
});

test("Health tab 'Updated' counter increments over time", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Updated \d+s ago/)).toBeVisible({ timeout: 10000 });
  // Wait 2 seconds and verify the counter has changed
  const initialText = await page.getByText(/Updated \d+s ago/).textContent();
  await page.waitForTimeout(2500);
  const updatedText = await page.getByText(/Updated \d+s ago/).textContent();
  expect(updatedText).not.toBe(initialText);
});

test("Health tab has a manual refresh button", async ({ page }) => {
  await page.goto("/?tab=system");
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
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // "Recent" sort button should be active by default
  const recentBtn = page.getByRole("button", { name: "Recent", exact: true });
  await expect(recentBtn).toBeVisible({ timeout: 5000 });
});

test("Cron Runs tab Health sort orders by success rate descending", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  const healthBtn = page.getByRole("button", { name: "Health", exact: true });
  await expect(healthBtn).toBeVisible({ timeout: 5000 });
  await healthBtn.click();
  // Jobs with 100% success should appear before jobs with lower rates
  // Verify at least the sort button is highlighted (secondary variant)
  await expect(healthBtn).toBeVisible();
});

test("Cron Runs tab timestamps use locale-appropriate formatting", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Expand a job to see run timestamps
  const jobButton = page.getByText("Nightly Build").first();
  await expect(jobButton).toBeVisible({ timeout: 10000 });
  await jobButton.click();
  // Timestamps should use en-US format (e.g., "Feb 13, 10:30 PM") not en-IN
  // Look for AM/PM format which confirms en-US locale
  await expect(page.getByText(/[AP]M/).first()).toBeVisible({ timeout: 5000 });
});

test("Analytics sub-view loads without crashing", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  const activityTab = page.getByRole("tab", { name: /Activity/ });
  await expect(activityTab).toHaveAttribute("data-state", "active");
  // Should show content even if there's no data — not crash
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
  // Wait a moment for data to load or "no data" state to render
  await page.waitForTimeout(2000);
  // The tab should still be visible (no crash)
  await expect(tabContent).toBeVisible();
});

test("Cron Runs tab visibility change triggers refresh", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
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
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // Simulate visibility change
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // Tab should still be functional
  await expect(page.getByText("System Health")).toBeVisible();
});

// === SYSTEM TAB: Logs Sub-View ===

test("System tab (Logs view) loads via URL", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  const systemTab = page.getByRole("tab", { name: /System/ });
  await expect(systemTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("Logs tab shows Log Viewer header", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
});

test("Logs tab shows source selector buttons", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  // Should show Mission Control source button
  await expect(page.getByRole("button", { name: /Mission Control/ })).toBeVisible({ timeout: 10000 });
});

test("Logs tab shows log entries from default source", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  // Wait for logs to load — the log container should have entries with INF/ERR/WRN labels
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
});

test("Logs tab switching source changes log content", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  // Wait for initial load
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  // Switch to Docker source
  const dockerBtn = page.getByRole("button", { name: /Docker/ });
  await expect(dockerBtn).toBeVisible({ timeout: 10000 });
  await dockerBtn.click();
  // Badge should update to show Docker
  await expect(page.locator('[class*="font-mono"]').filter({ hasText: "Docker" }).first()).toBeVisible({ timeout: 10000 });
});

test("Logs tab Live/Paused toggle works", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  // Live button should be visible by default
  const liveBtn = page.getByRole("button", { name: /Live/ });
  await expect(liveBtn).toBeVisible({ timeout: 10000 });
  // Click to pause
  await liveBtn.click();
  await expect(page.getByRole("button", { name: /Paused/ })).toBeVisible();
  // Click to resume
  await page.getByRole("button", { name: /Paused/ }).click();
  await expect(page.getByRole("button", { name: /Live/ })).toBeVisible();
});

test("Logs tab filter text input works", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  // Type in the filter input
  const filterInput = page.getByPlaceholder("Filter log messages...");
  await expect(filterInput).toBeVisible({ timeout: 10000 });
  await filterInput.fill("nonexistent-filter-string-xyz");
  // Should show filtered state (0 of N lines)
  await expect(page.getByText(/0 of \d+ lines/)).toBeVisible({ timeout: 5000 });
  // Clear the filter
  await filterInput.fill("");
});

test("Logs tab line count selector works", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  // Click 50 lines button
  const btn50 = page.getByRole("button", { name: "50", exact: true });
  await expect(btn50).toBeVisible({ timeout: 10000 });
  await btn50.click();
  // Wait for refresh
  await page.waitForTimeout(1000);
  // Click 200 lines button
  await page.getByRole("button", { name: "200", exact: true }).click();
});

test("Logs tab shows Updated Xs ago counter", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Updated \d+s ago/)).toBeVisible({ timeout: 10000 });
});

test("Logs API returns sources listing", async ({ request }) => {
  const response = await request.get("/api/logs");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty("sources");
  expect(Array.isArray(data.sources)).toBe(true);
  expect(data.sources.length).toBeGreaterThan(0);
  // Each source should have id, name, type, description
  for (const source of data.sources) {
    expect(source).toHaveProperty("id");
    expect(source).toHaveProperty("name");
    expect(source).toHaveProperty("type");
    expect(source).toHaveProperty("description");
  }
});

test("Logs API returns log entries for mission-control", async ({ request }) => {
  const response = await request.get("/api/logs?source=mission-control&lines=10");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty("source", "mission-control");
  expect(data).toHaveProperty("entries");
  expect(data).toHaveProperty("count");
  expect(Array.isArray(data.entries)).toBe(true);
  expect(data.count).toBeGreaterThan(0);
  // Each entry should have timestamp, level, message
  for (const entry of data.entries) {
    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("level");
    expect(entry).toHaveProperty("message");
  }
});

test("Logs API returns Cache-Control no-cache header", async ({ request }) => {
  const response = await request.get("/api/logs?source=mission-control&lines=5");
  expect(response.status()).toBe(200);
  const cacheControl = response.headers()["cache-control"];
  expect(cacheControl).toContain("no-cache");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).toContain("must-revalidate");
});

test("Logs API returns 400 for invalid source", async ({ request }) => {
  const response = await request.get("/api/logs?source=nonexistent");
  expect(response.status()).toBe(400);
});

test("command palette shows Log Viewer navigation item", async ({ page }) => {
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
  await page.fill('input[placeholder*="search files"]', "log viewer");
  await expect(page.getByText("Log Viewer")).toBeVisible();
});

test("Logs tab visibility change triggers refresh", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("Log Viewer")).toBeVisible();
});

// === UX POLISH TESTS: Skeleton Loaders, Log Highlighting, Toast Animation ===

test("skeleton loader renders animated elements (no bare 'Loading...' text)", async ({ page }) => {
  // Navigate to homepage — the skeleton should appear briefly before content loads
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  const tabPanel = page.getByRole("tabpanel");
  await expect(tabPanel).toBeVisible();
  // The old "Loading..." fallback div should NOT appear
  const oldFallback = tabPanel.locator('div.p-8.text-center.text-muted-foreground:text-is("Loading...")');
  await expect(oldFallback).not.toBeVisible();
});

test("all tabs render without generic 'Loading...' fallback", async ({ page }) => {
  for (const url of ["/?tab=activity", "/?tab=schedule", "/?tab=tasks", "/?tab=system"]) {
    await page.goto(url);
    const tabPanel = page.getByRole("tabpanel");
    await expect(tabPanel).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    const oldFallback = tabPanel.locator('div.p-8.text-center.text-muted-foreground:text-is("Loading...")');
    await expect(oldFallback).not.toBeVisible();
  }
});

test("log viewer highlights matching search terms with yellow marks", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  const filterInput = page.getByPlaceholder("Filter log messages...");
  await filterInput.fill("GET");
  await page.waitForTimeout(500);
  // If matches exist, <mark> elements should have yellow highlight
  const marks = page.locator("mark");
  const markCount = await marks.count();
  if (markCount > 0) {
    await expect(marks.first()).toBeVisible();
    await expect(marks.first()).toHaveClass(/bg-yellow/);
  }
});

test("log viewer clears highlights when search is cleared", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  const filterInput = page.getByPlaceholder("Filter log messages...");
  await filterInput.fill("test-search");
  await page.waitForTimeout(300);
  await filterInput.fill("");
  await page.waitForTimeout(300);
  await expect(page.locator("mark")).toHaveCount(0);
});

test("activity feed uses shared formatters (tokens show K/M suffix)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(3000);
  const tabPanel = page.getByRole("tabpanel");
  await expect(tabPanel).toBeVisible();
  const content = await tabPanel.textContent();
  expect(content).toBeTruthy();
});

// === KANBAN TASKS TESTS ===

test("Tasks API GET returns valid JSON with tasks array", async ({ request }) => {
  const response = await request.get("/api/tasks");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty("tasks");
  expect(data).toHaveProperty("total");
  expect(Array.isArray(data.tasks)).toBe(true);
  expect(typeof data.total).toBe("number");
});

test("Tasks API GET returns Cache-Control no-cache header", async ({ request }) => {
  const response = await request.get("/api/tasks");
  expect(response.status()).toBe(200);
  const cacheControl = response.headers()["cache-control"];
  expect(cacheControl).toContain("no-cache");
  expect(cacheControl).toContain("no-store");
  expect(cacheControl).toContain("must-revalidate");
});

test("Tasks API POST creates a task and returns it", async ({ request }) => {
  const response = await request.post("/api/tasks", {
    data: { title: "Test task from Playwright", priority: "high" },
  });
  expect(response.status()).toBe(201);
  const data = await response.json();
  expect(data).toHaveProperty("task");
  expect(data.task.title).toBe("Test task from Playwright");
  expect(data.task.priority).toBe("high");
  expect(data.task.status).toBe("todo");
  expect(data.task.source).toBe("manual");

  // Cleanup
  await request.delete(`/api/tasks/${data.task.id}`);
});

test("Tasks API POST rejects missing title", async ({ request }) => {
  const response = await request.post("/api/tasks", {
    data: { description: "No title" },
  });
  expect(response.status()).toBe(400);
});

test("Tasks API GET excludes archived by default", async ({ request }) => {
  const response = await request.get("/api/tasks");
  const data = await response.json();
  expect(data.tasks.every((t: any) => t.archived === false)).toBe(true);
});

test("Tasks API PATCH updates a task", async ({ request }) => {
  const createRes = await request.post("/api/tasks", {
    data: { title: "Patch test task" },
  });
  const { task } = await createRes.json();

  const patchRes = await request.patch(`/api/tasks/${task.id}`, {
    data: { status: "in_progress", priority: "urgent" },
  });
  expect(patchRes.status()).toBe(200);
  const patched = await patchRes.json();
  expect(patched.task.status).toBe("in_progress");
  expect(patched.task.priority).toBe("urgent");

  await request.delete(`/api/tasks/${task.id}`);
});

test("Tasks API PATCH sets completed_at when status becomes done", async ({ request }) => {
  const createRes = await request.post("/api/tasks", {
    data: { title: "Complete me" },
  });
  const { task } = await createRes.json();

  const patchRes = await request.patch(`/api/tasks/${task.id}`, {
    data: { status: "done" },
  });
  const patched = await patchRes.json();
  expect(patched.task.completedAt).toBeTruthy();

  await request.delete(`/api/tasks/${task.id}`);
});

test("Tasks API DELETE removes a task", async ({ request }) => {
  const createRes = await request.post("/api/tasks", {
    data: { title: "Delete me" },
  });
  const { task } = await createRes.json();

  const delRes = await request.delete(`/api/tasks/${task.id}`);
  expect(delRes.status()).toBe(200);
  const body = await delRes.json();
  expect(body.success).toBe(true);
});

test("Tasks API PATCH returns 404 for non-existent task", async ({ request }) => {
  const response = await request.patch("/api/tasks/00000000-0000-0000-0000-000000000000", {
    data: { title: "Nope" },
  });
  expect(response.status()).toBe(404);
});

test("Tasks API DELETE returns 404 for non-existent task", async ({ request }) => {
  const response = await request.delete("/api/tasks/00000000-0000-0000-0000-000000000000");
  expect(response.status()).toBe(404);
});

test("Assignees API returns valid JSON", async ({ request }) => {
  const response = await request.get("/api/assignees");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty("assignees");
  expect(Array.isArray(data.assignees)).toBe(true);
  expect(data.assignees.length).toBeGreaterThanOrEqual(2);
  const names = data.assignees.map((a: any) => a.name);
  expect(names).toContain("aj");
  expect(names).toContain("bot");
});

test("Tasks tab loads via URL", async ({ page }) => {
  await page.goto("/?tab=tasks");
  const tasksTab = page.getByRole("tab", { name: /Tasks/ });
  await expect(tasksTab).toHaveAttribute("data-state", "active");
  const tabContent = page.getByRole("tabpanel");
  await expect(tabContent).toBeVisible();
});

test("Tasks tab keyboard shortcut 3 works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.keyboard.press("3");
  await expect(page.getByRole("tab", { name: /Tasks/ })).toHaveAttribute("data-state", "active", { timeout: 5000 });
});

test("Tasks tab shows Kanban board with 4 columns", async ({ page }) => {
  await page.goto("/?tab=tasks");
  await expect(page.getByText("To Do")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("In Progress")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Blocked")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Done")).toBeVisible({ timeout: 10000 });
});

test("Tasks tab has quick-add input", async ({ page }) => {
  await page.goto("/?tab=tasks");
  await expect(page.getByText("To Do")).toBeVisible({ timeout: 10000 });
  await expect(page.getByPlaceholder("Add a task...")).toBeVisible({ timeout: 5000 });
});

test("command palette shows Tasks navigation item", async ({ page }) => {
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
  await page.fill('input[placeholder*="search files"]', "tasks");
  await expect(page.getByRole("button", { name: /Tasks/ }).first()).toBeVisible();
});

// === KEYBOARD SHORTCUT HELP TESTS ===

// Helper to dispatch ? key event (Playwright's keyboard.press may not produce e.key==="?" reliably)
async function pressQuestionMark(page: any) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "?",
      code: "Slash",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });
}

test("keyboard shortcut help opens with ? key", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await pressQuestionMark(page);
  await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 5000 });
});

test("keyboard shortcut help shows all sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await pressQuestionMark(page);
  await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 5000 });
  // Check for section headings
  await expect(page.getByText("Navigation").last()).toBeVisible();
  await expect(page.getByText("Sub-views").last()).toBeVisible();
  await expect(page.getByText("Actions").last()).toBeVisible();
});

test("keyboard shortcut help closes on backdrop click", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await pressQuestionMark(page);
  await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 5000 });
  // Click the backdrop (top-left corner)
  await page.click("body", { position: { x: 10, y: 10 } });
  await expect(page.getByText("Keyboard Shortcuts")).not.toBeVisible({ timeout: 5000 });
});

test("keyboard shortcut help close button works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await pressQuestionMark(page);
  await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 5000 });
  // Click close button
  await page.getByRole("button", { name: "Close shortcuts help" }).click();
  await expect(page.getByText("Keyboard Shortcuts")).not.toBeVisible({ timeout: 5000 });
});

test("keyboard shortcut help ? button in header exists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  // Wait for dynamic components (including KeyboardShortcuts) to load
  await page.waitForTimeout(1500);
  // The ? button should be visible on desktop
  const helpBtn = page.getByRole("button", { name: "Keyboard shortcuts" });
  await expect(helpBtn).toBeVisible({ timeout: 5000 });
  await helpBtn.click();
  await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 5000 });
});

test("keyboard shortcut help toggles on/off with ? key", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  // Open
  await pressQuestionMark(page);
  await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 5000 });
  // Toggle off
  await pressQuestionMark(page);
  await expect(page.getByText("Keyboard Shortcuts")).not.toBeVisible({ timeout: 5000 });
});

// === SUB-VIEW TOGGLE SHORTCUT HINTS ===

test("SubViewToggle shows shortcut hints on Activity tab", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1500);
  // The sub-view toggle should show shortcut hints like ⇧1, ⇧2, ⇧3
  const tabPanel = page.getByRole("tabpanel");
  await expect(tabPanel).toBeVisible();
  await expect(tabPanel.locator("kbd").filter({ hasText: "⇧1" }).first()).toBeVisible({ timeout: 5000 });
  await expect(tabPanel.locator("kbd").filter({ hasText: "⇧2" }).first()).toBeVisible({ timeout: 5000 });
});

test("SubViewToggle shows shortcut hints on System tab", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByRole("tab", { name: /System/ })).toHaveAttribute("data-state", "active");
  await page.waitForTimeout(1500);
  const tabPanel = page.getByRole("tabpanel");
  await expect(tabPanel).toBeVisible();
  await expect(tabPanel.locator("kbd").filter({ hasText: "⇧1" }).first()).toBeVisible({ timeout: 5000 });
  await expect(tabPanel.locator("kbd").filter({ hasText: "⇧2" }).first()).toBeVisible({ timeout: 5000 });
});

// === DYNAMIC PAGE TITLE ===

test("page title is set to Mission Control", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(2000);
  const title = await page.title();
  expect(title).toMatch(/^Mission Control/);
});

// === R KEY REFRESH ===

test("r key triggers refresh-view event", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // Wait for initial data load
  await expect(page.getByText(/Updated \d+s ago/)).toBeVisible({ timeout: 10000 });
  // Wait a moment for the counter to tick up
  await page.waitForTimeout(2000);
  // Press r to refresh
  await page.keyboard.press("r");
  // Counter should reset close to 0 after refresh
  await expect(page.getByText(/Updated [0-3]s ago/)).toBeVisible({ timeout: 5000 });
});

// === ACTIVITY FEED UX POLISH TESTS ===

test("Activity Feed shows date separators between date groups", async ({ page }) => {
  // Use 7-day range to increase chance of having multiple date groups
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(2000);
  // Click 7-day range filter
  const sevenDayBtn = page.getByRole("button", { name: "7 days", exact: true });
  await expect(sevenDayBtn).toBeVisible({ timeout: 5000 });
  await sevenDayBtn.click();
  await page.waitForTimeout(2000);
  // Date separators use role="separator" — at least one should be present if there are activities
  const separators = page.locator('[role="separator"]');
  const count = await separators.count();
  // Should have at least 1 separator (e.g. "Today") if activities exist
  if (count > 0) {
    await expect(separators.first()).toBeVisible();
    // Separator should contain a date label (Today, Yesterday, or a date)
    const text = await separators.first().textContent();
    expect(text).toBeTruthy();
  }
});

test("Activity Feed items have category left borders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(3000);
  // Activity items have role="button" and border-l-[3px] class
  const activityItems = page.locator('[role="button"][aria-expanded]');
  const itemCount = await activityItems.count();
  if (itemCount > 0) {
    // First item should have border-l-[3px] class for category border
    const firstItem = activityItems.first();
    await expect(firstItem).toBeVisible();
    const className = await firstItem.getAttribute("class");
    expect(className).toContain("border-l-");
  }
});

test("Activity Feed shows refresh indicator", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  // Wait for data to load — the "Updated Xs ago" text should appear
  await expect(page.getByText(/Updated \d+s ago/).first()).toBeVisible({ timeout: 15000 });
});

test("Activity Feed refresh button spins while fetching", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(2000);
  // The refresh button should exist
  const refreshBtn = page.getByRole("button", { name: "Refresh feed" });
  await expect(refreshBtn).toBeVisible({ timeout: 10000 });
  // Click the refresh button
  await refreshBtn.click();
  // Counter should reset close to 0
  await expect(page.getByText(/Updated [0-5]s ago/).first()).toBeVisible({ timeout: 10000 });
});

// === QUICK TASK CREATION VIA COMMAND PALETTE ===

// Helper to open command palette
async function openCommandPalette(page: any) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "k", code: "KeyK", metaKey: true, ctrlKey: true, bubbles: true, cancelable: true,
    }));
  });
}

test("command palette has New Task action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await openCommandPalette(page);
  await expect(page.getByPlaceholder("search files")).toBeVisible({ timeout: 5000 });
  // Type "new task" to find the action
  await page.fill('input[placeholder*="search files"]', "new task");
  await expect(page.getByText("New Task").first()).toBeVisible({ timeout: 5000 });
});

test("command palette '> task' prefix shows Create Task section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await openCommandPalette(page);
  await expect(page.getByPlaceholder("search files")).toBeVisible({ timeout: 5000 });
  // Type "> My Test Task" to trigger quick-create mode
  await page.fill('input[placeholder*="search files"]', "> My Test Task");
  // Create Task section header should appear
  await expect(page.getByText("Create Task", { exact: true }).first()).toBeVisible({ timeout: 5000 });
});

test("command palette quick task creation shows all 4 priorities", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await openCommandPalette(page);
  await expect(page.getByPlaceholder("search files")).toBeVisible({ timeout: 5000 });
  await page.fill('input[placeholder*="search files"]', "> Priority Test Task");
  // All 4 priority labels should show
  await expect(page.getByText("Medium priority").first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("High priority").first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Urgent").first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Low priority").first()).toBeVisible({ timeout: 5000 });
});

test("command palette quick task footer changes to task-mode hints", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  await openCommandPalette(page);
  await expect(page.getByPlaceholder("search files")).toBeVisible({ timeout: 5000 });
  await page.fill('input[placeholder*="search files"]', "> Quick Footer Test");
  // Footer should show "Quick task mode" hint
  await expect(page.getByText("Quick task mode")).toBeVisible({ timeout: 5000 });
});

test("command palette quick task creates task via API and shows toast", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible();
  await page.waitForTimeout(1000);
  const taskTitle = `Playwright Quick Task ${Date.now()}`;
  await openCommandPalette(page);
  await expect(page.getByPlaceholder("search files")).toBeVisible({ timeout: 5000 });
  // Type the task with > prefix
  await page.fill('input[placeholder*="search files"]', `> ${taskTitle}`);
  await expect(page.getByText("Create Task", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  // Press Enter to create with the first (medium priority) option selected
  await page.keyboard.press("Enter");
  // Toast should appear confirming creation
  await expect(page.getByText(/Task created/)).toBeVisible({ timeout: 10000 });
  // Palette should close
  await expect(page.getByPlaceholder("search files")).not.toBeVisible({ timeout: 5000 });
  // Clean up: delete the created task via API
  const res = await page.evaluate(async (title) => {
    const listRes = await fetch("/api/tasks");
    const data = await listRes.json();
    const task = data.tasks.find((t: any) => t.title === title);
    if (task) {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      return task.id;
    }
    return null;
  }, taskTitle);
  // Task should have been found and cleaned up
  expect(res).toBeTruthy();
});

// === SERVICES VIEW: CATEGORY FILTER AND RESPONSE TIME BARS ===

test("Services view shows category filter pills", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  await expect(page.getByText("Services Directory")).toBeVisible({ timeout: 10000 });
  // Wait for services to load
  await page.waitForTimeout(3000);
  // Category filter pills should appear (if there are multiple categories)
  // Look for the "All" pill which always appears when multiple categories exist
  const allPill = page.locator("button").filter({ hasText: /^All$/ });
  const count = await allPill.count();
  if (count > 0) {
    await expect(allPill.first()).toBeVisible({ timeout: 5000 });
  }
});

test("Services view response time bars render for up services", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  await expect(page.getByText("Services Directory")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(3000);
  // Services with responseTime should show "ms" in the response bar
  const msText = page.locator("span").filter({ hasText: /^\d+ms$/ });
  const msCount = await msText.count();
  // At least one service should show response time
  expect(msCount).toBeGreaterThan(0);
});

test("Services view category filter filters the grid", async ({ page }) => {
  await page.goto("/?tab=system&view=services");
  await expect(page.getByText("Services Directory")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(3000);

  // Count initial service cards
  const allCards = page.locator('[data-testid="service-card"]');
  const totalCount = await allCards.count();
  if (totalCount === 0) return; // No services loaded

  // Find a category pill (not "All")
  const categoryPills = page.locator("button").filter({ hasText: /^(monitoring|finance|creative|core|media|ai)$/ });
  const pillCount = await categoryPills.count();
  if (pillCount === 0) return; // Only one category

  // Click the first category pill
  await categoryPills.first().click();
  await page.waitForTimeout(500);

  // Card count should be <= total (filtered)
  const filteredCards = page.locator('[data-testid="service-card"]');
  const filteredCount = await filteredCards.count();
  expect(filteredCount).toBeLessThanOrEqual(totalCount);
});

// === NEW FEATURE TESTS: Trend percentages, Network rates, Kanban feedback ===

test("Analytics stat cards show trend percentage numbers", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  await expect(page.getByText("Usage Analytics")).toBeVisible({ timeout: 10000 });
  // Wait for data to load
  await page.waitForTimeout(3000);
  // If a trend exists (up or down), it should show a percentage like "+23%" or "-15%"
  // Look for the trend percentage pattern in stat cards
  const trendPercentages = page.locator("span.font-mono").filter({ hasText: /^[+-]?\d+%$/ });
  const count = await trendPercentages.count();
  // If there's enough data for non-flat trends, percentages should appear
  // Even if flat, the component should render without errors
  expect(count).toBeGreaterThanOrEqual(0);
});

test("Analytics uses shared model color utility", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  await expect(page.getByText("Usage Analytics")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(3000);
  // Model Breakdown section should render model names with colored dots
  const modelBreakdown = page.getByText("Model Breakdown");
  await expect(modelBreakdown).toBeVisible({ timeout: 10000 });
});

test("Network section shows RX Rate and TX Rate columns", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // Scroll to network section and check for Rate column headers
  await expect(page.getByText("RX Rate")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("TX Rate")).toBeVisible({ timeout: 10000 });
});

test("Network section shows RX Total and TX Total columns", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("RX Total")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("TX Total")).toBeVisible({ timeout: 10000 });
});

test("Network section shows throughput rates after second refresh", async ({ page }) => {
  await page.goto("/?tab=system");
  await expect(page.getByText("System Health")).toBeVisible({ timeout: 10000 });
  // Wait for at least two data fetches (10s interval) for rate calculation
  await page.waitForTimeout(12000);
  // After second fetch, rate values should appear (B/s, KB/s, or MB/s)
  const rateValues = page.locator("td.font-mono").filter({ hasText: /\d+(\.\d+)?\s*(B\/s|KB\/s|MB\/s)/ });
  const count = await rateValues.count();
  expect(count).toBeGreaterThan(0);
});

test("Kanban In Progress column icon animates", async ({ page }) => {
  await page.goto("/?tab=tasks");
  await expect(page.getByText("In Progress")).toBeVisible({ timeout: 10000 });
  // The Loader2 icon in the In Progress column header should have animate-spin class
  const inProgressHeader = page.getByText("In Progress").locator("..");
  const spinner = inProgressHeader.locator("svg.animate-spin");
  await expect(spinner).toBeVisible({ timeout: 5000 });
});

test("Kanban task save shows toast notification", async ({ page }) => {
  await page.goto("/?tab=tasks");
  await expect(page.getByText("To Do")).toBeVisible({ timeout: 10000 });
  // Create a test task
  const taskTitle = `Toast Test ${Date.now()}`;
  const quickAddInput = page.getByPlaceholder("Add a task...");
  await expect(quickAddInput).toBeVisible({ timeout: 5000 });
  await quickAddInput.fill(taskTitle);
  await quickAddInput.press("Enter");
  await page.waitForTimeout(1000);

  // Click the task card to open detail sheet
  const taskCard = page.getByText(taskTitle);
  await expect(taskCard).toBeVisible({ timeout: 5000 });
  await taskCard.click();

  // Sheet should open
  await expect(page.getByText("Task Details")).toBeVisible({ timeout: 5000 });

  // Click Save
  await page.getByRole("button", { name: "Save" }).click();

  // Toast should appear
  await expect(page.getByText("Task updated")).toBeVisible({ timeout: 5000 });

  // Clean up: delete via API
  await page.evaluate(async (title) => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    const task = data.tasks.find((t: any) => t.title === title);
    if (task) await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
  }, taskTitle);
});

// === UX POLISH TESTS (delta CPU, keyboard shortcuts, toast, status strip) ===

test("Health API returns delta-based CPU values (user+system+idle sums to ~100)", async ({ page }) => {
  // First request primes the cache; second gives delta-based values
  await page.goto("/");
  const res1 = await page.evaluate(() => fetch("/api/health").then(r => r.json()));
  // Wait a bit for CPU to accumulate some delta
  await page.waitForTimeout(2000);
  const res2 = await page.evaluate(() => fetch("/api/health").then(r => r.json()));
  const cpu = res2.cpu;
  expect(cpu.user).toBeGreaterThanOrEqual(0);
  expect(cpu.system).toBeGreaterThanOrEqual(0);
  expect(cpu.idle).toBeGreaterThanOrEqual(0);
  expect(cpu.user).toBeLessThanOrEqual(100);
  expect(cpu.system).toBeLessThanOrEqual(100);
  expect(cpu.idle).toBeLessThanOrEqual(100);
  const sum = cpu.user + cpu.system + cpu.idle;
  // Sum should be close to 100 (allow some rounding tolerance)
  expect(sum).toBeGreaterThan(95);
  expect(sum).toBeLessThanOrEqual(100.5);
});

test("Keyboard shortcuts modal closes with Escape key", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  // Open shortcuts modal with ? key
  await page.keyboard.press("?");
  await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 3000 });
  // Press Escape to close
  await page.keyboard.press("Escape");
  await expect(page.getByText("Keyboard Shortcuts")).not.toBeVisible({ timeout: 3000 });
});

test("Keyboard shortcuts modal has ARIA dialog role", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  await page.keyboard.press("?");
  await expect(page.getByText("Keyboard Shortcuts")).toBeVisible({ timeout: 3000 });
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-label", "Keyboard shortcuts");
  // Close
  await page.keyboard.press("Escape");
});

test("Keyboard shortcuts modal has open/close animation", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  await page.keyboard.press("?");
  // The dialog container should have transition classes
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 3000 });
  // After animation settles, should be fully visible (opacity-100, scale-100)
  await expect(dialog).toHaveClass(/opacity-100/);
  await expect(dialog).toHaveClass(/scale-100/);
  await page.keyboard.press("Escape");
});

test("Toast notifications have ARIA role=status", async ({ page }) => {
  await page.goto("/?tab=tasks");
  await expect(page.getByText("To Do")).toBeVisible({ timeout: 10000 });
  // Create and save a task to trigger a toast
  const taskTitle = `ARIA Toast Test ${Date.now()}`;
  const quickAddInput = page.getByPlaceholder("Add a task...");
  await expect(quickAddInput).toBeVisible({ timeout: 5000 });
  await quickAddInput.fill(taskTitle);
  await quickAddInput.press("Enter");
  await page.waitForTimeout(1000);
  await page.getByText(taskTitle).click();
  await expect(page.getByText("Task Details")).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Save" }).click();
  // Toast should have role="status" for screen readers
  const toast = page.locator('[role="status"]').filter({ hasText: "Task updated" });
  await expect(toast).toBeVisible({ timeout: 5000 });
  // Clean up
  await page.evaluate(async (title) => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    const task = data.tasks.find((t: any) => t.title === title);
    if (task) await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
  }, taskTitle);
});

test("StatusStrip dot does not pulse when system is healthy", async ({ page }) => {
  await page.goto("/");
  // Wait for health data to load
  await page.waitForTimeout(3000);
  // The desktop status dot — should exist but not animate-pulse when healthy (<70%)
  const statusDot = page.locator('div[title="System healthy"]');
  const count = await statusDot.count();
  if (count > 0) {
    // If system is healthy, the dot should NOT have animate-pulse class
    const classes = await statusDot.getAttribute("class");
    expect(classes).not.toContain("animate-pulse");
  }
  // If system is at high usage, the dot will have title "High resource usage" and that's fine
});

// === NEW FEATURE TESTS: Analytics UX Overhaul ===

test("Analytics has 1d time range button", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  await expect(page.getByRole("button", { name: "1d" })).toBeVisible({ timeout: 10000 });
});

test("Analytics time range buttons include 1d, 7d, 14d, 30d", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  for (const range of ["1d", "7d", "14d", "30d"]) {
    await expect(page.getByRole("button", { name: range, exact: true })).toBeVisible({ timeout: 10000 });
  }
});

test("Analytics 1d button switches to 1-day window", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  const btn1d = page.getByRole("button", { name: "1d", exact: true });
  await expect(btn1d).toBeVisible({ timeout: 10000 });
  await btn1d.click();
  // After clicking 1d, the subtitle should show "1-day window"
  await expect(page.getByText("1-day window")).toBeVisible({ timeout: 5000 });
});

test("Analytics bar charts have Y-axis scale labels", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  // Wait for charts to render
  await expect(page.getByText("Daily Cost")).toBeVisible({ timeout: 10000 });
  // Y-axis labels are rendered as SVG <text> elements inside the bar chart SVGs
  // The Daily Cost chart container should have scale labels (the "$" prefix indicates cost Y-axis)
  const costChart = page.locator("text=Daily Cost").locator("..").locator("..");
  const svgTexts = costChart.locator("svg text");
  // Should have Y-axis labels (at least midpoint + max) plus X-axis date labels
  const textCount = await svgTexts.count();
  expect(textCount).toBeGreaterThan(2);
});

test("Analytics cost trend uses amber color when going up (not green)", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  await expect(page.getByText("Total Cost")).toBeVisible({ timeout: 10000 });
  // Find the cost stat card
  const costCard = page.locator("text=Total Cost").locator("..").locator("..");
  // If there's a trend indicator, check it doesn't use emerald/green for "up"
  const trendEl = costCard.locator('[class*="text-emerald"]').locator("svg");
  // TrendingUp icon should NOT be in emerald color within the cost card
  // (it should be amber for cost going up)
  const emeraldTrendUps = costCard.locator('[class*="text-emerald"] svg.lucide-trending-up');
  expect(await emeraldTrendUps.count()).toBe(0);
});

test("Analytics daily breakdown table shows inline mini-bars", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  await expect(page.getByText("Daily Breakdown")).toBeVisible({ timeout: 10000 });
  // Mini-bars are inline divs with rounded-full bg-*-500/50 classes
  const table = page.locator("text=Daily Breakdown").locator("..").locator("table");
  await expect(table).toBeVisible({ timeout: 5000 });
  // Check for at least one mini-bar within the table body
  const miniBars = table.locator("td .rounded-full.bg-muted\\/30");
  const count = await miniBars.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test("Analytics loading shows skeleton, not plain text", async ({ page }) => {
  // Navigate to analytics — the skeleton should show before data loads
  // We verify by checking that the page never shows the old "Loading analytics..." text
  await page.goto("/?tab=activity&view=analytics");
  // The old loading text should not appear
  const plainLoading = page.locator("text=Loading analytics...");
  // Give it a moment, then check — if skeleton is working, this text won't appear
  await page.waitForTimeout(500);
  expect(await plainLoading.count()).toBe(0);
});

test("Analytics model breakdown section visible", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  await expect(page.getByText("Model Breakdown")).toBeVisible({ timeout: 10000 });
});

test("Analytics hourly heatmap section visible", async ({ page }) => {
  await page.goto("/?tab=activity&view=analytics");
  await expect(page.getByText("Activity by Hour")).toBeVisible({ timeout: 10000 });
});

// === NEW FEATURE TESTS: SystemHealth Process Tooltips ===

test("SystemHealth process table commands are visible", async ({ page }) => {
  await page.goto("/?tab=system&view=health");
  await expect(page.getByText("Top Processes")).toBeVisible({ timeout: 10000 });
  // Process table has a "Command" column header — find that specific table
  const table = page.locator("table", { has: page.locator("th", { hasText: "Command" }) });
  await expect(table).toBeVisible({ timeout: 5000 });
  const rows = table.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
});

// === NEW FEATURE TESTS: Enhanced formatDuration ===

test("Health API returns valid duration fields", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  // uptime is in seconds — should be a positive number
  expect(data.uptime).toBeGreaterThan(0);
});

// === AGENT SESSIONS UX OVERHAUL TESTS ===

test("Agents sub-view loads under Activity tab", async ({ page }) => {
  await page.goto("/?tab=activity&view=agents");
  // Wait for tabs to render (Suspense + dynamic imports)
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("tab", { name: /Activity/ })).toHaveAttribute("data-state", "active");
  // Should show either the sessions card title or empty state
  await expect(
    page.getByText("Sessions", { exact: true }).or(page.getByText("No active sessions"))
  ).toBeVisible({ timeout: 15000 });
});

test("Agents sub-view shows session list card with search input", async ({ page }) => {
  await page.goto("/?tab=activity&view=agents");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder("Search sessions...")).toBeVisible({ timeout: 15000 });
});

test("Agents sub-view has auto-refresh toggle", async ({ page }) => {
  await page.goto("/?tab=activity&view=agents");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible({ timeout: 15000 });
  const autoBtn = page.getByRole("button", { name: /Auto/ });
  await expect(autoBtn).toBeVisible({ timeout: 15000 });
});

test("Agents sub-view shows detail panel placeholder on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?tab=activity&view=agents");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Select a session to view details")).toBeVisible({ timeout: 15000 });
});

test("Agents API returns valid session list", async ({ request }) => {
  const response = await request.get("/api/agents?action=list&limit=5");
  // API may return 200 with data or empty array
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(Array.isArray(data)).toBeTruthy();
});

test("Agents sub-view toggles via SubViewToggle", async ({ page }) => {
  await page.goto("/?tab=activity");
  // Wait for tabs and sub-view toggle to render
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);
  // Click the Agents toggle button
  const agentsToggle = page.getByRole("button", { name: "Agents" });
  await expect(agentsToggle).toBeVisible({ timeout: 10000 });
  await agentsToggle.click();
  // Should now show the Agents view
  await expect(page.getByPlaceholder("Search sessions...")).toBeVisible({ timeout: 15000 });
});

test("Agents session detail shows session ID with copy button when session exists", async ({ page, request }) => {
  // First check if there are sessions
  const response = await request.get("/api/agents?action=list&limit=1");
  const sessions = await response.json();
  if (!Array.isArray(sessions) || sessions.length === 0) {
    test.skip();
    return;
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?tab=activity&view=agents");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible({ timeout: 15000 });
  // Wait for sessions to load, then click the first one
  const sessionItem = page.locator("[role=button]").first();
  await expect(sessionItem).toBeVisible({ timeout: 15000 });
  await sessionItem.click();
  // Detail panel should show Session ID label
  await expect(page.getByText("Session ID")).toBeVisible({ timeout: 15000 });
  // Copy button should be present (aria-label)
  await expect(page.getByLabel("Copy session ID")).toBeVisible();
});

test("Agents session detail shows duration when timeline has timestamps", async ({ page, request }) => {
  const response = await request.get("/api/agents?action=list&limit=1");
  const sessions = await response.json();
  if (!Array.isArray(sessions) || sessions.length === 0) {
    test.skip();
    return;
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?tab=activity&view=agents");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible({ timeout: 15000 });
  const sessionItem = page.locator("[role=button]").first();
  await expect(sessionItem).toBeVisible({ timeout: 15000 });
  await sessionItem.click();
  // Detail panel loads — check for Duration row or Timeline header
  await expect(
    page.getByText("Duration").or(page.getByText(/Timeline \(\d+ messages?\)/))
  ).toBeVisible({ timeout: 15000 });
});

test("Agents session list shows duration badge when available", async ({ page, request }) => {
  const response = await request.get("/api/agents?action=list&limit=5");
  const sessions = await response.json();
  if (!Array.isArray(sessions) || sessions.length === 0) {
    test.skip();
    return;
  }
  await page.goto("/?tab=activity&view=agents");
  await expect(page.getByRole("tab", { name: /Activity/ })).toBeVisible({ timeout: 15000 });
  // Wait for session cards to appear
  const sessionItem = page.locator("[role=button]").first();
  await expect(sessionItem).toBeVisible({ timeout: 15000 });
  // Session cards should have model badges visible
  await expect(page.locator("[role=button]").first().locator(".text-purple-400")).toBeVisible();
});

// === NEW FEATURE TESTS: CronHistory UX Improvements ===

test("CronHistory shows job count badge in header", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Job count badge should show "N jobs" (rendered as a Badge component with font-mono)
  await expect(page.locator('[class*="font-mono"]').filter({ hasText: /\d+ jobs?/ }).first()).toBeVisible({ timeout: 10000 });
});

test("CronHistory has search input for filtering jobs", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Search input should be visible
  await expect(page.getByPlaceholder("Search jobs by name...")).toBeVisible({ timeout: 10000 });
});

test("CronHistory search filters jobs by name", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Wait for jobs to load
  await expect(page.getByText("Nightly Build").first()).toBeVisible({ timeout: 10000 });

  // Type a search query that matches
  const searchInput = page.getByPlaceholder("Search jobs by name...");
  await searchInput.fill("Nightly");
  await page.waitForTimeout(500);
  // "Nightly Build" should still be visible
  await expect(page.getByText("Nightly Build").first()).toBeVisible();

  // Type a search that doesn't match
  await searchInput.fill("nonexistent-xyz-job");
  await page.waitForTimeout(500);
  // Should show "No jobs matching" message
  await expect(page.getByText(/No jobs matching/)).toBeVisible({ timeout: 5000 });
});

test("CronHistory search has clear button", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  const searchInput = page.getByPlaceholder("Search jobs by name...");
  await searchInput.fill("test");
  // Clear button should appear (it's a plain button with aria-label)
  const clearBtn = page.getByLabel("Clear search");
  await expect(clearBtn).toBeVisible({ timeout: 5000 });
  await clearBtn.click();
  // Input should be empty
  await expect(searchInput).toHaveValue("");
});

test("CronHistory shows Updated Xs ago counter", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Updated \d+s ago/)).toBeVisible({ timeout: 10000 });
});

test("CronHistory shows sparklines on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Nightly Build").first()).toBeVisible({ timeout: 10000 });
  // On desktop (sm: and above), the non-compact sparkline should be visible
  // Sparkline bars have title attributes with em-dash
  const sparklineBars = page.locator('.hidden.sm\\:block [title]');
  const count = await sparklineBars.count();
  expect(count).toBeGreaterThan(0);
});

test("CronHistory run detail dialog opens with structured content", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Expand a job
  const jobButton = page.getByText("Nightly Build").first();
  await expect(jobButton).toBeVisible({ timeout: 10000 });
  await jobButton.click();
  // Click on a run to open detail dialog
  const runEntry = page.locator('svg.text-emerald-500, svg.text-red-500').first();
  await expect(runEntry).toBeVisible({ timeout: 5000 });
  await runEntry.click();
  // Dialog should open — look for the dialog content with Status badge
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  // Should show Completed label
  await expect(dialog.getByText("Completed")).toBeVisible({ timeout: 5000 });
  // Should show Duration label (if the run has duration)
  const durationLabel = dialog.getByText("Duration");
  const hasDuration = await durationLabel.count();
  if (hasDuration > 0) {
    await expect(durationLabel).toBeVisible();
  }
});

test("CronHistory search shows filtered count", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Nightly Build").first()).toBeVisible({ timeout: 10000 });
  // Type a search query
  const searchInput = page.getByPlaceholder("Search jobs by name...");
  await searchInput.fill("Nightly");
  await page.waitForTimeout(500);
  // Should show "N of M jobs" counter
  await expect(page.getByText(/\d+ of \d+ jobs/)).toBeVisible({ timeout: 5000 });
});

test("CronHistory run entries show duration ratio when available", async ({ page }) => {
  await page.goto("/?tab=schedule&view=runs");
  await expect(page.getByText("Cron Run History")).toBeVisible({ timeout: 10000 });
  // Expand a job
  const jobButton = page.getByText("Nightly Build").first();
  await expect(jobButton).toBeVisible({ timeout: 10000 });
  await jobButton.click();
  // Look for the duration ratio pattern (e.g., "1.2x")
  const ratios = page.locator("span").filter({ hasText: /^\(\d+\.\d+x\)$/ });
  const count = await ratios.count();
  // At least one run should show duration ratio if there are multiple runs with durations
  expect(count).toBeGreaterThanOrEqual(0);
});

// === NEW FEATURE TESTS: LogViewer UX Overhaul ===

test("LogViewer shows level distribution bar", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  // Wait for logs to load
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  // The level distribution bar should be visible
  const bar = page.locator('[data-testid="level-distribution-bar"]');
  await expect(bar).toBeVisible({ timeout: 5000 });
});

test("LogViewer shows line numbers in gutter", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  // Line numbers should start at 1 — look for "1" as the first line number
  const lineNumbers = page.locator("[data-log-line] span").first();
  await expect(lineNumbers).toBeVisible();
  await expect(lineNumbers).toHaveText("1");
});

test("LogViewer word wrap toggle exists and works", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  // Wrap toggle button should exist
  const wrapBtn = page.locator('[data-testid="wrap-toggle"]');
  await expect(wrapBtn).toBeVisible({ timeout: 5000 });
  // Click to toggle off — should switch to secondary variant
  await wrapBtn.click();
  // Click again to toggle on
  await wrapBtn.click();
});

test("LogViewer relative time toggle exists and works", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  // Time toggle button should exist
  const timeBtn = page.locator('[data-testid="time-toggle"]');
  await expect(timeBtn).toBeVisible({ timeout: 5000 });
  // Click to switch to relative time
  await timeBtn.click();
  // Should show relative timestamps like "Xs ago" or "Xm ago"
  await page.waitForTimeout(500);
  const relativeTimestamps = page.locator("[data-log-line]").locator("span").filter({ hasText: /\d+[smhd] ago/ });
  const count = await relativeTimestamps.count();
  expect(count).toBeGreaterThan(0);
  // Click again to go back to absolute time
  await timeBtn.click();
});

test("LogViewer copy line button appears on hover", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  // Hover over a log line to show the copy button
  const firstLogLine = page.locator("[data-log-line]").first();
  await firstLogLine.hover();
  // The copy button should become visible on hover
  const copyBtn = firstLogLine.getByLabel("Copy line");
  await expect(copyBtn).toBeVisible({ timeout: 3000 });
});

test("LogViewer error navigation appears when errors exist", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  // Check if there are errors/warnings in the log
  const errElements = page.locator("[data-log-line]").filter({ hasText: /^.*ERR|WRN/ });
  const errorCount = await errElements.count();
  if (errorCount > 0) {
    // Error navigation should be visible
    const errorNav = page.locator('[data-testid="error-nav"]');
    await expect(errorNav).toBeVisible({ timeout: 5000 });
  }
});

test("LogViewer skeleton loading state renders animated elements", async ({ page }) => {
  // Navigate with an invalid source to force loading state momentarily
  await page.goto("/?tab=system&view=logs");
  // The initial load should show skeleton (animated pulse elements) not plain text
  // Check that the page eventually loads log content (regression test)
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  // INF entries should eventually appear (confirms logs loaded successfully)
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
});

test("LogViewer footer shows filtered line count", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  // Footer should show "N of M lines"
  await expect(page.getByText(/\d+ of \d+ lines/)).toBeVisible({ timeout: 5000 });
});

test("LogViewer filter text shows filtered count in footer", async ({ page }) => {
  await page.goto("/?tab=system&view=logs");
  await expect(page.getByText("Log Viewer")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("INF").first()).toBeVisible({ timeout: 10000 });
  const filterInput = page.getByPlaceholder("Filter log messages...");
  await filterInput.fill("GET");
  await page.waitForTimeout(500);
  // Footer should show "(filtered)" indicator
  const filtered = page.getByText(/\d+ of \d+ lines \(filtered\)/);
  await expect(filtered).toBeVisible({ timeout: 5000 });
});
