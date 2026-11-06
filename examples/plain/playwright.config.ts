import { defineConfig } from "@playwright/test";

const PORT = 8501;

export default defineConfig({
  testDir: "./test",
  // Pins live in a single IndexedDB. Parallel workers would fight over the same DB, so run serially.
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  // By default test-results/ lands in the repo root; keep it inside the example.
  outputDir: "./test-results",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `bun run ../serve.ts . ${PORT}`,
    url: `http://localhost:${PORT}/`,
    // serve.ts resolves the given dir against the process cwd, so a wrong cwd
    // starts fine but serves 404 on "/". Set it explicitly to rule that out.
    cwd: import.meta.dirname,
    reuseExistingServer: !process.env.CI,
  },
});
