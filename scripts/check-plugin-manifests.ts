#!/usr/bin/env bun
/**
 * Assert the two plugin manifests stay valid AND stay in agreement.
 *
 * This repository is one plugin described twice, because two formats read it:
 *
 *   .claude-plugin/plugin.json + .mcp.json   Claude Code
 *   plugin.json + mcp.json                   Agent Plugins 1.0.0
 *                                            (https://agent-plugins.org)
 *
 * WHY A GATE. The failure mode is silent in both directions. The Agent Plugins
 * manifest schema is CLOSED (`additionalProperties: false`), so copying a
 * Claude Code field such as `skills` or `displayName` into the portable
 * manifest makes it unknown — a conformant client reports and ignores it and
 * keeps going, so nothing crashes and the plugin looks fine. And because the
 * two files are edited by hand, the version in one drifts from the version in
 * the other the first time anyone bumps it; a client that uses `version` for
 * cache freshness then serves a stale plugin with no error anywhere.
 *
 * The checks are hand-written rather than fetched from the published schemas.
 * §5.2 says a client MUST NOT retrieve a schema while loading a plugin, and the
 * same reasoning applies here: `verify` has to pass offline.
 */

export {};

const ROOT = new URL("..", import.meta.url).pathname;

const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";

/** §5.2. The schema is closed, so anything outside this set is unknown. */
const MANIFEST_FIELDS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

/** §5.5. Lowercase alphanumerics, `-` and `.`, no `--`/`..`, ends alphanumeric. */
const NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
/** §5.5 length bound, which the pattern alone does not express. */
const NAME_MAX = 64;

/** §7.2.1 stdio. Every other field makes the server entry invalid. */
const STDIO_FIELDS = new Set(["type", "command", "args", "env", "cwd"]);

/** §9.2. These two expand; anything else stays literal, which is the bug. */
const PLACEHOLDER = /\$\{([^}]*)\}/g;
const EXPANDS = new Set(["PLUGIN_ROOT", "PLUGIN_DATA"]);

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

async function json(path: string): Promise<Record<string, unknown>> {
  return (await Bun.file(ROOT + path).json()) as Record<string, unknown>;
}

const portable = await json("plugin.json");
const claude = await json(".claude-plugin/plugin.json");
const mcp = await json("mcp.json");
const claudeMcp = await json(".mcp.json");

// --- plugin.json (§5) ---------------------------------------------------

if (portable.$schema !== PLUGIN_SCHEMA) fail(`plugin.json: $schema must be ${PLUGIN_SCHEMA}`);
for (const key of Object.keys(portable)) {
  if (!MANIFEST_FIELDS.has(key)) fail(`plugin.json: unknown field ${key} (the schema is closed)`);
}
if (
  typeof portable.name !== "string" ||
  portable.name.length > NAME_MAX ||
  !NAME.test(portable.name)
) {
  fail(`plugin.json: name ${JSON.stringify(portable.name)} breaks the §5.5 constraints`);
}
if (portable.author !== undefined) {
  const author = portable.author as Record<string, unknown>;
  for (const key of Object.keys(author)) {
    if (!["name", "email", "url"].includes(key)) fail(`plugin.json: author.${key} is not allowed`);
  }
}

// --- the two manifests describe the same plugin -------------------------

for (const field of ["name", "version", "description", "license", "keywords"] as const) {
  if (JSON.stringify(portable[field]) !== JSON.stringify(claude[field])) {
    fail(
      `plugin.json and .claude-plugin/plugin.json disagree on ${field}: ` +
        `${JSON.stringify(portable[field])} vs ${JSON.stringify(claude[field])}`,
    );
  }
}

// --- mcp.json (§7.2, §9.2) ----------------------------------------------

if (mcp.$schema !== MCP_SCHEMA) fail(`mcp.json: $schema must be ${MCP_SCHEMA}`);
for (const key of Object.keys(mcp)) {
  if (key !== "$schema" && key !== "mcpServers") fail(`mcp.json: unknown top-level field ${key}`);
}

const servers = (mcp.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
const claudeServers = (claudeMcp.mcpServers ?? {}) as Record<string, unknown>;

// A server the portable manifest forgets is a server nobody outside Claude Code
// can reach, and the reverse means a name that only half the clients know.
const names = new Set([...Object.keys(servers), ...Object.keys(claudeServers)]);
for (const name of names) {
  if (!(name in servers)) fail(`mcp.json is missing the ${name} server that .mcp.json declares`);
  if (!(name in claudeServers))
    fail(`.mcp.json is missing the ${name} server that mcp.json declares`);
}

for (const [name, server] of Object.entries(servers)) {
  const at = `mcp.json: ${name}`;
  if (server.type !== "stdio") {
    // The remote variants are legal; this repo just does not ship one, and the
    // field rules below are the stdio ones.
    fail(`${at}: only the stdio transport is checked here, got ${JSON.stringify(server.type)}`);
    continue;
  }
  for (const key of Object.keys(server)) {
    if (!STDIO_FIELDS.has(key)) fail(`${at}: unknown field ${key} for a stdio server`);
  }

  // §7.2.1: one executable token, bare or `./`-relative. No expansion happens
  // here, so a `${PLUGIN_ROOT}` in `command` would be passed through literally
  // and the launch would fail on a path that does not exist.
  const command = server.command;
  if (typeof command !== "string" || command.length === 0) {
    fail(`${at}: command must be a non-empty string`);
  } else if (command.includes(" ") || command.includes("${")) {
    fail(`${at}: command must be a single unexpanded token, got ${JSON.stringify(command)}`);
  } else if (command.includes("/") && !command.startsWith("./")) {
    fail(`${at}: a path command must begin with ./ and stay inside the plugin root`);
  }

  const cwd = server.cwd;
  if (cwd !== undefined) {
    const ok =
      typeof cwd === "string" &&
      (cwd.startsWith("./") ||
        cwd === "${PLUGIN_ROOT}" ||
        cwd.startsWith("${PLUGIN_ROOT}/") ||
        cwd === "${PLUGIN_DATA}" ||
        cwd.startsWith("${PLUGIN_DATA}/"));
    if (!ok)
      fail(
        `${at}: cwd must be ./…, \${PLUGIN_ROOT}… or \${PLUGIN_DATA}…, got ${JSON.stringify(cwd)}`,
      );
  }

  // §9.2. `${FUSEN_BASE_URL}` and friends are NOT expanded by an Agent Plugins
  // client — they arrive at the process as that literal text. For fusen that is
  // worse than leaving the variable out: bin.ts branches on FUSEN_BASE_URL
  // being set at all, so a literal placeholder routes every read to an HTTP
  // store pointed at a garbage URL instead of falling back to the browser.
  const strings: Array<[string, unknown]> = [
    ...(Array.isArray(server.args)
      ? server.args.map((v, i) => [`args[${i}]`, v] as [string, unknown])
      : []),
    ...Object.entries((server.env ?? {}) as Record<string, unknown>).map(
      ([k, v]) => [`env.${k}`, v] as [string, unknown],
    ),
  ];
  for (const [where, value] of strings) {
    if (typeof value !== "string") {
      fail(`${at}: ${where} must be a string`);
      continue;
    }
    for (const [, variable] of value.matchAll(PLACEHOLDER)) {
      if (!EXPANDS.has(variable!))
        fail(`${at}: ${where} uses \${${variable}}, which no client expands`);
    }
  }
  for (const key of Object.keys((server.env ?? {}) as Record<string, unknown>)) {
    // §9.2: the client sets these itself, and declaring them invalidates the entry.
    if (EXPANDS.has(key)) fail(`${at}: env must not declare ${key}`);
  }
}

// --- skills (§7.1 -> the Agent Skills spec) -----------------------------

// Without this the manifests can be perfectly conformant while the only
// component a portable client would actually surface gets skipped.
const skills = new Bun.Glob("skills/*/SKILL.md");
let skillCount = 0;
for await (const file of skills.scan({ cwd: ROOT })) {
  skillCount++;
  const directory = file.split("/")[1]!;
  const text = await Bun.file(ROOT + file).text();
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  if (!frontmatter) {
    fail(`${file}: no YAML frontmatter`);
    continue;
  }
  // Single-line scalars only. A folded (`>-`) or block (`|`) description would
  // read as empty here rather than as its real length — worth a real YAML parse
  // the day a skill needs one.
  const name = /^name:[ \t]*(.+)$/m.exec(frontmatter)?.[1]?.trim();
  const description = /^description:[ \t]*(.+)$/m.exec(frontmatter)?.[1]?.trim();
  if (name !== directory)
    fail(`${file}: name ${JSON.stringify(name)} must match the directory ${directory}`);
  if (!description) fail(`${file}: description is required`);
  else if (description.length > 1024)
    fail(`${file}: description is ${description.length} characters, max 1024`);
}
if (skillCount === 0) fail("skills/ has no SKILL.md — a portable client would surface nothing");

if (problems.length > 0) {
  console.error("Plugin manifests are not conformant:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Plugin manifests OK (${Object.keys(servers).length} MCP server(s), ${skillCount} skill(s))`,
);
