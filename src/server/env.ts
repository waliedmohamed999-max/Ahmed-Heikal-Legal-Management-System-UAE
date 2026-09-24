import "server-only";
import { loadConfig } from "./config";

/**
 * Validated environment (see ./config.ts). The server validates it at boot in
 * `instrumentation.ts`, so a missing or weak secret stops the process before it
 * serves a single request; this accessor is the cached result.
 */
export const env = () => loadConfig();
