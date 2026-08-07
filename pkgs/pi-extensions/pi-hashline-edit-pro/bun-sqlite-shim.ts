// Downstream-only shim. Not upstream code — injected by default.nix.
//
// pi-hashline-edit-pro targets pi's declared engine (package.json:
// "bin": {"pi": "dist/cli.js"}, "engines": {"node": ">=22.19.0"}), where
// `node:sqlite` is a builtin. But llm-agents.nix packages pi's *other*
// distribution — the `bun build --compile` binary from pi's `build:binary`
// script — so pi actually runs on Bun, which has `bun:sqlite` and no
// `node:sqlite`. Loading the extension unpatched dies at import with:
//   ResolveMessage: No such built-in module: node:sqlite
//
// `Database` covers everything src/hash-store.ts asks of `DatabaseSync`
// (exec, prepare → get/all/run, close) except the constructor, which differs
// in two ways: Bun requires explicit open flags, and it takes no `timeout`
// option — that has to become a busy_timeout pragma.
//
// Drop this file (and its substituteInPlace in default.nix) if upstream adds
// runtime detection, or if pi is ever repackaged to run dist/cli.js on Node.
import { Database } from "bun:sqlite";

export class DatabaseSync extends Database {
  constructor(path: string, options?: { timeout?: number }) {
    // node:sqlite opens read-write and creates by default; Bun errors with
    // SQLITE_MISUSE ("flags must include SQLITE_OPEN_READONLY or
    // SQLITE_OPEN_READWRITE") unless the flags are spelled out.
    super(path, { create: true, readwrite: true });
    if (options?.timeout !== undefined) {
      this.exec(`PRAGMA busy_timeout = ${options.timeout}`);
    }
  }
}
