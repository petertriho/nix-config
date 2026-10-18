# REA

This package builds REA from a pinned `main` commit.
It supplies `rea`, `rea-agents`, an MCP server, and upstream skills.

The package includes Node.js 24, native PTY support, and Linux `ps`.
It excludes Frida, external analysis engines, JDKs, and browsers.

Run a static JavaScript analysis:

```bash
nix run .#rea -- analyze-javascript-application /absolute/path/to/app --json
```

## Home Manager

The shared AI profile enables REA.
For another profile, enable the module:

```nix
programs.rea.enable = true;
```

The module registers `rea mcp` through `programs.ai.mcp.rea`.
It discovers skills in `${pkgs.rea}/share/rea/skills` for `programs.ai.skills`.
Discovery can build the selected package during evaluation.
In skills, the package replaces only REA `npx` commands with `rea`.
The shared profile leaves Codex MCP disabled.

Do not run `rea setup` against Home Manager-managed files.
It can conflict with managed registrations and skill symlinks.

## Update

Do not use `rea update`.
Update `src.rev`, the snapshot date, the source hash, and `npmDepsHash` in `default.nix`.

Do not add `--omit=optional`.
It removes required PTY and build-tool packages.

## Checks

Run the sandbox checks:

```bash
nix build --no-write-lock-file .#rea.tests.smoke
```

The sandbox checks cover skills, CLI aliases, static analysis, and MCP startup and shutdown.

Run the native PTY check on the host with Node.js 24:

```bash
package=$(nix build --no-write-lock-file --no-link --print-out-paths .#rea)
node pkgs/rea/smoke-test.mjs \
  "$package/lib/node_modules/rea-agents" "$package/bin/rea" --pty
```

Run the Home Manager module checks:

```bash
nix eval --no-write-lock-file --impure --json --expr '
  let
    flake = builtins.getFlake (toString ./.);
    pkgs = import flake.inputs.nixpkgs { system = "x86_64-linux"; };
  in import ./pkgs/rea/tests/module.nix { inherit pkgs; }
'
```

For untracked files, use `path:$PWD#...` flake references.

## Platforms

- `x86_64-linux`: build, sandbox checks, and host PTY check passed.
- `aarch64-linux`, `aarch64-darwin`: evaluation passed. Native builds and runtime checks remain pending.
- `x86_64-darwin`: deferred because the locked Nixpkgs rejects this platform.
