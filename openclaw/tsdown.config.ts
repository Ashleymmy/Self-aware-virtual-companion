import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

const rootDir = dirname(fileURLToPath(import.meta.url));
type BuildEntry = string | string[] | Record<string, string>;

function buildInputOptions(options: { onLog?: unknown; [key: string]: unknown }) {
  if (process.env.OPENCLAW_BUILD_VERBOSE === "1") {
    return undefined;
  }

  const previousOnLog = typeof options.onLog === "function" ? options.onLog : undefined;

  return {
    ...options,
    onLog(
      level: string,
      log: { code?: string },
      defaultHandler: (level: string, log: { code?: string }) => void,
    ) {
      if (log.code === "PLUGIN_TIMINGS") {
        return;
      }
      if (typeof previousOnLog === "function") {
        previousOnLog(level, log, defaultHandler);
        return;
      }
      defaultHandler(level, log);
    },
  };
}

function nodeBuildConfig(config: Record<string, unknown>) {
  return {
    ...config,
    env,
    fixedExtension: false,
    platform: "node",
    inputOptions: buildInputOptions,
  };
}

function resolveExistingEntry(entry: BuildEntry): BuildEntry | undefined {
  if (typeof entry === "string") {
    return existsSync(resolve(rootDir, entry)) ? entry : undefined;
  }

  if (Array.isArray(entry)) {
    const existing = entry.filter((item) => existsSync(resolve(rootDir, item)));
    return existing.length > 0 ? existing : undefined;
  }

  const existing = Object.fromEntries(
    Object.entries(entry).filter(([, target]) => existsSync(resolve(rootDir, target))),
  );
  return Object.keys(existing).length > 0 ? existing : undefined;
}

function maybeNodeBuildConfig(config: Record<string, unknown> & { entry: BuildEntry }) {
  const entry = resolveExistingEntry(config.entry);
  if (!entry) {
    return null;
  }
  return nodeBuildConfig({
    ...config,
    entry,
  });
}

const pluginSdkEntrypoints = [
  "index",
  "core",
  "compat",
  "telegram",
  "discord",
  "slack",
  "signal",
  "imessage",
  "whatsapp",
  "line",
  "msteams",
  "acpx",
  "bluebubbles",
  "copilot-proxy",
  "device-pair",
  "diagnostics-otel",
  "diffs",
  "feishu",
  "google-gemini-cli-auth",
  "googlechat",
  "irc",
  "llm-task",
  "lobster",
  "matrix",
  "mattermost",
  "memory-core",
  "memory-lancedb",
  "minimax-portal-auth",
  "nextcloud-talk",
  "nostr",
  "open-prose",
  "phone-control",
  "qwen-portal-auth",
  "synology-chat",
  "talk-voice",
  "test-utils",
  "thread-ownership",
  "tlon",
  "twitch",
  "voice-call",
  "zalo",
  "zalouser",
  "account-id",
  "keyed-async-queue",
] as const;

// Vendored snapshots can lag behind upstream package exports; skip absent entry files
// so local/container builds can still produce the runtime artifacts this repo uses.
const availablePluginSdkEntrypoints = pluginSdkEntrypoints.filter((entry) =>
  existsSync(resolve(rootDir, "src/plugin-sdk", `${entry}.ts`)),
);

export default defineConfig([
  maybeNodeBuildConfig({
    entry: "src/index.ts",
  }),
  maybeNodeBuildConfig({
    entry: "src/entry.ts",
  }),
  maybeNodeBuildConfig({
    // Ensure this module is bundled as an entry so legacy CLI shims can resolve its exports.
    entry: "src/cli/daemon-cli.ts",
  }),
  maybeNodeBuildConfig({
    entry: "src/infra/warning-filter.ts",
  }),
  maybeNodeBuildConfig({
    // Keep sync lazy-runtime channel modules as concrete dist files.
    entry: {
      "channels/plugins/agent-tools/whatsapp-login":
        "src/channels/plugins/agent-tools/whatsapp-login.ts",
      "channels/plugins/actions/discord": "src/channels/plugins/actions/discord.ts",
      "channels/plugins/actions/signal": "src/channels/plugins/actions/signal.ts",
      "channels/plugins/actions/telegram": "src/channels/plugins/actions/telegram.ts",
      "telegram/audit": "src/telegram/audit.ts",
      "telegram/token": "src/telegram/token.ts",
      "line/accounts": "src/line/accounts.ts",
      "line/send": "src/line/send.ts",
      "line/template-messages": "src/line/template-messages.ts",
    },
  }),
  ...availablePluginSdkEntrypoints.map((entry) =>
    maybeNodeBuildConfig({
      entry: `src/plugin-sdk/${entry}.ts`,
      outDir: "dist/plugin-sdk",
    }),
  ),
  maybeNodeBuildConfig({
    entry: "src/extensionAPI.ts",
  }),
  maybeNodeBuildConfig({
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
  }),
].filter((config): config is NonNullable<typeof config> => config !== null));
