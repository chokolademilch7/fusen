import { defineConfig, devices } from "@playwright/test";

const PORT = 8503;

export default defineConfig({
  testDir: "./test",
  reporter: "list",
  // One IndexedDB per origin. Running in parallel makes tests fight over the same DB.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `bunx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
  },
});
