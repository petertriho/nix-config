import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelCost } from "@earendil-works/pi-ai";

export const EXTENSION_NAME = "pi-cliproxyapi-provider";

export const PROVIDER_ID = "cliproxyapi";

export const PROVIDER_NAME = "CLIProxyAPI";

export const BASE_URL_ENV_VAR = "CLIPROXYAPI_BASE_URL";

export const API_KEY_ENV_VAR = "CLIPROXYAPI_API_KEY";

/**
 * Shared custom event emitted after a runtime model-catalog refresh.
 *
 * Keep this value in sync with pi-context-window-cap.ts. The cap extension
 * uses it to clamp model objects that replace the session model after
 * session_start.
 */
export const MODEL_CATALOG_REFRESHED_EVENT = "dotfiles:model-catalog-refreshed";

export const PAUSE_STATUS_KEY = "cliproxyapi";

// pi-tui-shell moves this status into the model header.
export const FAST_STATUS_KEY = "cliproxyapi-fast";

export const QUOTA_RESUME_STATUS_KEY = "cliproxyapi-quota-resume";

export const QUOTA_WAIT_STATUS_KEY = "cliproxyapi-quota-wait";

export const ZERO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Subset of a `/v1/models?client_version=pi` catalog entry that is mapped. */

export function logWarn(message: string): void {
  console.warn(`[${EXTENSION_NAME}] ${message}`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function writeTextFile(path: string, text: string): void {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporaryPath, text, "utf8");
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup after a failed atomic replacement.
    }
    logWarn(`failed to write ${path}: ${errorMessage(error)}`);
  }
}
