import type { GatewayRequestHandlers } from "./types.js";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../../config/config.js";
import {
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
  getTtsProvider,
  isTtsEnabled,
  isTtsProviderConfigured,
  resolveTtsAutoMode,
  resolveTtsApiKey,
  resolveTtsConfig,
  resolveTtsPrefsPath,
  resolveTtsProviderOrder,
  setTtsEnabled,
  setTtsProvider,
  textToSpeech,
} from "../../tts/tts.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";

const DEFAULT_MAX_INLINE_AUDIO_BYTES = 2 * 1024 * 1024; // 2 MiB

function asPositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function audioMimeTypeByExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".opus") return "audio/ogg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

export const ttsHandlers: GatewayRequestHandlers = {
  "tts.status": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const config = resolveTtsConfig(cfg);
      const prefsPath = resolveTtsPrefsPath(config);
      const provider = getTtsProvider(config, prefsPath);
      const autoMode = resolveTtsAutoMode({ config, prefsPath });
      const fallbackProviders = resolveTtsProviderOrder(provider)
        .slice(1)
        .filter((candidate) => isTtsProviderConfigured(config, candidate));
      respond(true, {
        enabled: isTtsEnabled(config, prefsPath),
        auto: autoMode,
        provider,
        fallbackProvider: fallbackProviders[0] ?? null,
        fallbackProviders,
        prefsPath,
        hasOpenAIKey: Boolean(resolveTtsApiKey(config, "openai")),
        hasElevenLabsKey: Boolean(resolveTtsApiKey(config, "elevenlabs")),
        edgeEnabled: isTtsProviderConfigured(config, "edge"),
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
  "tts.enable": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const config = resolveTtsConfig(cfg);
      const prefsPath = resolveTtsPrefsPath(config);
      setTtsEnabled(prefsPath, true);
      respond(true, { enabled: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
  "tts.disable": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const config = resolveTtsConfig(cfg);
      const prefsPath = resolveTtsPrefsPath(config);
      setTtsEnabled(prefsPath, false);
      respond(true, { enabled: false });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
  "tts.convert": async ({ params, respond }) => {
    const text = typeof params.text === "string" ? params.text.trim() : "";
    if (!text) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "tts.convert requires text"),
      );
      return;
    }
    const inline = params.inline === true;
    const maxInlineBytes =
      asPositiveNumber(params.maxInlineBytes) ?? DEFAULT_MAX_INLINE_AUDIO_BYTES;
    try {
      const cfg = loadConfig();
      const channel = typeof params.channel === "string" ? params.channel.trim() : undefined;
      const result = await textToSpeech({ text, cfg, channel });
      if (result.success && result.audioPath) {
        if (inline) {
          const filePath = result.audioPath;
          const fileStat = await stat(filePath);
          if (fileStat.size > maxInlineBytes) {
            respond(
              false,
              undefined,
              errorShape(
                ErrorCodes.INVALID_REQUEST,
                `inline audio too large (${fileStat.size} bytes > ${maxInlineBytes} bytes)`,
              ),
            );
            return;
          }

          const audioBytes = await readFile(filePath);
          respond(true, {
            audioPath: result.audioPath,
            provider: result.provider,
            outputFormat: result.outputFormat,
            voiceCompatible: result.voiceCompatible,
            audioInline: {
              encoding: "base64",
              mimeType: audioMimeTypeByExt(filePath),
              bytes: fileStat.size,
              data: audioBytes.toString("base64"),
            },
          });
          return;
        }
        respond(true, {
          audioPath: result.audioPath,
          provider: result.provider,
          outputFormat: result.outputFormat,
          voiceCompatible: result.voiceCompatible,
        });
        return;
      }
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "TTS conversion failed"),
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
  "tts.setProvider": async ({ params, respond }) => {
    const provider = typeof params.provider === "string" ? params.provider.trim() : "";
    if (provider !== "openai" && provider !== "elevenlabs" && provider !== "edge") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "Invalid provider. Use openai, elevenlabs, or edge.",
        ),
      );
      return;
    }
    try {
      const cfg = loadConfig();
      const config = resolveTtsConfig(cfg);
      const prefsPath = resolveTtsPrefsPath(config);
      setTtsProvider(prefsPath, provider);
      respond(true, { provider });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
  "tts.providers": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const config = resolveTtsConfig(cfg);
      const prefsPath = resolveTtsPrefsPath(config);
      respond(true, {
        providers: [
          {
            id: "openai",
            name: "OpenAI",
            configured: Boolean(resolveTtsApiKey(config, "openai")),
            models: [...OPENAI_TTS_MODELS],
            voices: [...OPENAI_TTS_VOICES],
          },
          {
            id: "elevenlabs",
            name: "ElevenLabs",
            configured: Boolean(resolveTtsApiKey(config, "elevenlabs")),
            models: ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_monolingual_v1"],
          },
          {
            id: "edge",
            name: "Edge TTS",
            configured: isTtsProviderConfigured(config, "edge"),
            models: [],
          },
        ],
        active: getTtsProvider(config, prefsPath),
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
