import { defineConfig, devices } from "@playwright/test";

const PORT = 8502;

export default defineConfig({
  testDir: "./test",
  // IndexedDB is shared per origin, so running in parallel lets another
  // test's beforeEach clear() wipe the current test's data.
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // build + preview, not the dev server. The premise is that a consumer only
    // "serves a bundle that includes the prebuilt fusen-lite.js", and we want to
    // verify exactly that.
    command: "bunx vite build && bunx vite preview --port 8502 --strictPort",
    url: `http://localhost:${PORT}/`,
    // CI always starts its own server. Locally, reuse one that is already up.
    // This one used to be hard-coded to `false`, so running the suite with this
    // example open during development failed with "port in use" (the other two
    // examples had this shape from the start).
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
