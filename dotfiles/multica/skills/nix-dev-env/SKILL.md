---
name: nix-dev-env
description: Set up an ephemeral Nix flake dev environment for repository work and run every project command through it. Use before the first project command in a workspace, whenever a required tool (python, uv, node, yarn, ...) is missing from PATH, on any "command not found" failure, or on any impulse to install a runtime or toolchain. Never installs anything on the host machine.
---

# Nix Dev Env

Multica workspaces are fresh clones with no project toolchain on PATH.
Provide python, uv, node, yarn, and friends through an ephemeral Nix flake
dev shell that lives next to the repo — never by installing onto the host.

## Layout

The task workspace looks like:

```
<workdir>/<repo-name>/                      # git clone; never write env files here
<workdir>/.dev-env/<repo-name>/flake.nix    # generated dev environment
<workdir>/.envrc                            # direnv loader for interactive (human) shells
```

`<workdir>` is the directory containing the repo clones. It is not a git
repository, which is what makes the flake usable: nix ignores untracked
files inside git repos, so an in-repo flake.nix would not work.

## Detect

Pick packages from files committed in the repo:

| Evidence                        | Packages          |
| ------------------------------- | ----------------- |
| `uv.lock` or `pyproject.toml`   | `python3` `uv`    |
| `yarn.lock`                     | `nodejs` `yarn`   |
| `package.json` (no `yarn.lock`) | `nodejs`          |
| `go.mod`                        | `go`              |
| `Cargo.toml`                    | `rustc` `cargo`   |

Respect version pins when present: `requires-python` / `.python-version`
→ `python312`, `python311`, ...; `.nvmrc` / `engines.node` → `nodejs_20`,
`nodejs_22`, .... Otherwise use the unversioned default. A monorepo with
several toolchains gets one flake with the combined package list.

## Bootstrap

Create `<workdir>/.dev-env/<repo-name>/` and write this `flake.nix`,
substituting the `packages` list from the table above:

```nix
{
  description = "Development Environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forEachSupportedSystem =
        f: nixpkgs.lib.genAttrs supportedSystems (system: f { pkgs = import nixpkgs { inherit system; }; });
    in
    {
      devShells = forEachSupportedSystem (
        { pkgs }:
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              python3
              uv
            ];
            env = {
              UV_PYTHON_DOWNLOADS = "never";
              UV_PROJECT_ENVIRONMENT = ".venv";
            };
          };
        }
      );
    };
}
```

Keep the `env` block for python projects: it forces uv to use the nix
python and a local `.venv` instead of downloading its own interpreter.
For non-python projects, replace the `packages` list and drop the `env`
attribute entirely.

## Direnv

After writing the flake, register it in `<workdir>/.envrc` so a human who
later opens the workspace in an interactive shell gets the environment
automatically:

Append the line `use flake ./.dev-env/<repo-name>` to `<workdir>/.envrc`,
creating the file if needed and skipping the line if it is already present
(one line per repo). Never run `direnv allow` — the human approves the
file themselves on first visit.

This does nothing for you: the direnv hook only fires at an interactive
prompt, never in your non-interactive per-command shells. Keep wrapping
every project command with `nix develop ... -c` as described below.

## Run

Wrap every project command. Shell state does not persist between commands,
so the wrapper is per command, not per session:

```sh
cd <workdir>/<repo-name>
nix develop ../.dev-env/<repo-name> -c uv sync
nix develop ../.dev-env/<repo-name> -c uv run pytest tests/
nix develop ../.dev-env/<repo-name> -c yarn install
nix develop ../.dev-env/<repo-name> -c yarn test
```

- The first `nix develop` fetches nixpkgs and builds the shell; allow a
  generous timeout (up to 10 minutes). Later invocations are cached and
  fast.
- If `nix` is not on PATH, use the absolute path
  `/nix/var/nix/profiles/default/bin/nix`.

## Extend

When a command is missing from the dev shell, add its nixpkgs package to
the flake's `packages` list and rerun. Search names with
`nix search nixpkgs <name>` when unsure. Do not install it any other way.

## Prohibitions

- Never install toolchains or packages on the host: no `brew install`, no
  `uv python install` or `uv tool install`, no `npm install -g`, no
  `pip install --user`, no `pipx install`, no `curl | sh` installers, no
  symlinking binaries into PATH directories, no editing shell profiles or
  dotfiles.
- Never write `flake.nix`, `.envrc`, or other environment files inside the
  repository clone — `.envrc` belongs at the `<workdir>` level only.
- Never commit or push anything under `.dev-env/`.
