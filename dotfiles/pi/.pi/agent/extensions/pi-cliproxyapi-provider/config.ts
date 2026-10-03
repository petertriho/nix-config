import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { asRecord } from "./shared.ts";

const FAST_ENV_VAR = "CLIPROXYAPI_FAST";

export const CONFIG_FILE_NAME = "cliproxyapi.json";

function readConfigFile(configPath: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    // Parser errors can quote configuration values, including a management key.
    throw new Error(`invalid ${CONFIG_FILE_NAME}: expected valid JSON`, { cause: error });
  }
  const parsed = asRecord(value);
  if (!parsed) throw new Error(`${CONFIG_FILE_NAME} must contain a JSON object`);
  return parsed;
}

/** Persisted pause flag. A missing file or key means not paused. Throws when the value is not a boolean. */

export function readPauseSetting(configPath: string): boolean {
  const value = readConfigFile(configPath).pause;
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new Error(`${CONFIG_FILE_NAME} field "pause" must be a boolean`);
  }
  return value;
}

function saveBooleanSetting(configPath: string, key: "pause" | "fast" | "quotaResume", value: boolean): void {
  // Do not discard other settings when an existing file cannot be read.
  const existing = readConfigFile(configPath);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify({ ...existing, [key]: value }, null, 2)}\n`, "utf8");
}

/** Write the pause flag and keep the other keys. Throws on invalid config or write failure. */

export function savePauseSetting(configPath: string, pause: boolean): void {
  saveBooleanSetting(configPath, "pause", pause);
}

/** Resolve Fast from the environment, then the configuration file, then false. */

export function readFastSetting(configPath: string, envValue = process.env[FAST_ENV_VAR]): boolean {
  const env = envValue?.trim().toLowerCase();
  if (env) {
    if (["true", "1", "yes", "on"].includes(env)) return true;
    if (["false", "0", "no", "off"].includes(env)) return false;
    throw new Error(`${FAST_ENV_VAR} must be one of: true, false, 1, 0, yes, no, on, off`);
  }
  const value = readConfigFile(configPath).fast;
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error(`${CONFIG_FILE_NAME} field "fast" must be a boolean`);
  return value;
}

/** Write the Fast flag without changing pause or connection settings. */

export function saveFastSetting(configPath: string, fast: boolean): void {
  saveBooleanSetting(configPath, "fast", fast);
}

/** Automatic quota waiting is opt-in. Pending requests are never persisted. */

export function readQuotaResumeSetting(configPath: string): boolean {
  const value = readConfigFile(configPath).quotaResume;
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error(`${CONFIG_FILE_NAME} field "quotaResume" must be a boolean`);
  return value;
}

export function saveQuotaResumeSetting(configPath: string, enabled: boolean): void {
  saveBooleanSetting(configPath, "quotaResume", enabled);
}

/** The Nix launch wrapper uses CLI_PROXY_API_KEY as its management password. */

export function resolveManagementKey(configPath: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.CLIPROXYAPI_MANAGEMENT_KEY?.trim();
  if (explicit) return explicit;
  const configured = readConfigFile(configPath).managementKey;
  if (configured !== undefined && (typeof configured !== "string" || !configured.trim())) {
    throw new Error(`${CONFIG_FILE_NAME} field "managementKey" must be a non-empty string`);
  }
  return typeof configured === "string" ? configured.trim() : env.CLI_PROXY_API_KEY?.trim() || undefined;
}

/** In-memory pause state shared by the commands and the request gate. */
