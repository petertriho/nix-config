# nono-packs

This derivation is the single source of truth for the `nolabs-ai` **Claude**,
**Pi**, and **OpenCode** agent packs on this machine. It fetches one pinned
`nolabs-ai/nono-packs` commit, copies the three selected pack directories into
the Nix store, and generates ordinary local base profiles.

These packs are **not** registry-managed. They are loaded as plain user
profiles, so they intentionally bypass nono's registry lockfile, signer
provenance, and `.nono-trust.bundle` verification. Integrity comes from the Nix
fixed-output hash below instead.

## Current pin

| Field    | Value                                            |
| -------- | ------------------------------------------------ |
| Revision | `58f77c73a949bad1a9e261bb824c51e323589984`       |
| Date     | 2026-07-31                                       |
| Version  | `0-unstable-2026-07-31`                          |
| Hash     | `sha256-PSCULavCdfBe1JlOun+jOgAvG6GrzlIlqr5RY8lwzyU=` |

The pin lives in [`default.nix`](./default.nix).

## Where things go

```
$out/share/nono-packs/
  packs/{claude,pi,opencode}/   # immutable pack content
  profiles/nono-*-base.json     # generated local base profiles
```

Home Manager links the three profiles into `$XDG_CONFIG_HOME/nono/profiles`
and the OpenCode plugin and skill into `$XDG_CONFIG_HOME/opencode`. It declares
the Claude pack through `programs.claude-code.plugins`, which loads it as a
persistent personal plugin under `~/.claude/skills/nono-sandbox`. The Pi pack
is loaded from the store through `programs.pi-coding-agent.settings.packages`.

## Updating the packs

All three packs move together because they share one commit.

1. Pick the new `nolabs-ai/nono-packs` commit and note its date.
2. In `default.nix`, update `rev` to the new commit and `version` to
   `0-unstable-YYYY-MM-DD` (the commit date).
3. Recompute the source hash:

   ```bash
   nix-prefetch-url --type sha256 --unpack \
     "https://github.com/nolabs-ai/nono-packs/archive/<rev>.tar.gz" | \
     xargs nix hash to-sri --type sha256
   ```

   Put the resulting `sha256-...` string into `hash`.

4. Build and review:

   ```bash
   nix build .#packages.<system>.nono-packs
   ```

   The build validates each manifest (`schema_version`, pack name, profile
   artifact), the Claude personal-plugin structure, and the specific Pi and
   OpenCode wiring this integration reproduces. **A build failure here means
   upstream changed a manifest, plugin, or wiring shape this config depends
   on.** Do not silence it. Review the upstream diff and update
   `modules/home-manager/programs/nono.nix` or `pi.nix` to match before updating
   the pin.

5. Switch with the normal Home Manager / NixOS / nix-darwin command.

### `nono update` and `nnu` do NOT update these packs

`nono update` (and the `nnu` Fish abbreviation) only act on registry-managed
packs. These three packs are no longer registry-managed, so those commands have
no effect on them. `nnu` is retained only for any other registry packs.

### `nono list --installed` will not list these packs

That is expected. Inspect them with `nono profile list` instead, where the six
profiles (`nono-{claude,pi,opencode}-base` and `{claude,pi,opencode}-nix`)
appear as ordinary user profiles.

## One-time migration (before the first declarative switch)

> **Warning:** These steps remove the current registry installation. Run them
> **before** the first switch to the declarative generation, so old mutable
> wiring cannot collide with the new Home Manager links or leave duplicate
> profile providers. The replacement must already build and evaluate (see the
> validation steps in `.artifacts/nix-declarative-nono-packs/`).

1. Record the current state so it can be restored if needed:

   ```bash
   cp -a ~/.config/nono/packages/lockfile.json ~/nono-lockfile.backup.json
   cp -a ~/.claude/plugins/known_marketplaces.json ~/known_marketplaces.backup.json
   cp -a ~/.claude/plugins/installed_plugins.json ~/installed_plugins.backup.json
   cp -a ~/.pi/agent/settings.json ~/pi-settings.backup.json
   nono list --installed > ~/nono-installed.backup.txt
   ```

2. Remove the three registry packs while their lockfile and wiring records still
   exist (`nono remove` reverses the wiring it applied at install time):

   ```bash
   nono remove nolabs-ai/claude
   nono remove nolabs-ai/pi
   nono remove nolabs-ai/opencode
   ```

3. Remove the profile-draft markers those packs wrote:

   ```bash
   rm -f "$XDG_CONFIG_HOME/nono/profile-drafts/.nono-claude-pack-marker" \
         "$XDG_CONFIG_HOME/nono/profile-drafts/.nono-pi-pack-marker" \
         "$XDG_CONFIG_HOME/nono/profile-drafts/.nono-opencode-pack-marker"
   ```

4. **Verify, then remove** stale `always-further` directories. These are left
   over from the old namespace and must be unreferenced before deletion:

   ```bash
   if grep -H -n "always-further" \
        ~/.claude/plugins/known_marketplaces.json \
        ~/.claude/plugins/installed_plugins.json \
        ~/.pi/agent/settings.json \
        ~/.config/nono/packages/lockfile.json 2>/dev/null; then
     echo "always-further is still referenced; do NOT delete its directories" >&2
   else
     rm -rf ~/.claude/plugins/marketplaces/always-further \
            ~/.claude/plugins/cache/always-further \
            ~/.config/nono/packages/always-further
   fi
   ```

5. Remove only leftover package directories for these three packs. Do not
   remove the namespace directory or lockfile because they can contain other
   registry-managed packs:

   ```bash
   rm -rf ~/.config/nono/packages/nolabs-ai/claude \
          ~/.config/nono/packages/nolabs-ai/pi \
          ~/.config/nono/packages/nolabs-ai/opencode

   if test -f ~/.config/nono/packages/lockfile.json; then
     jq -e '
       (.packages // {})
       | has("nolabs-ai/claude") == false
       and has("nolabs-ai/pi") == false
       and has("nolabs-ai/opencode") == false
     ' ~/.config/nono/packages/lockfile.json
   fi
   ```

6. Confirm the old registry wiring is gone, then run the switch:

   ```bash
   ls ~/.config/nono/packages/nolabs-ai 2>/dev/null || true
   test ! -e ~/.claude/plugins/marketplaces/nolabs-ai/plugins/nono
   test ! -e ~/.claude/plugins/cache/nolabs-ai/nono
   test ! -e ~/.config/opencode/plugins/nono-sandbox.ts
   test ! -e ~/.config/opencode/skills/nono-sandbox
   ```

   Then activate the declarative generation (NixOS / nix-darwin / standalone
   Home Manager as appropriate for the host).

## Validation after switching

```bash
nono profile validate nono-claude-base
nono profile validate nono-pi-base
nono profile validate nono-opencode-base
nono profile validate claude-nix
nono profile validate pi-nix
nono profile validate opencode-nix
```

In a temporary project directory:

```bash
nono run --profile claude-nix   --allow-cwd --dry-run -- claude
nono run --profile pi-nix       --allow-cwd --dry-run -- pi
nono run --profile opencode-nix --allow-cwd --dry-run -- opencode
```

Confirm the Home Manager-managed agent integrations resolve into the active
`nono-packs` output:

```bash
readlink -f ~/.claude/skills/nono-sandbox
readlink -f ~/.config/opencode/plugins/nono-sandbox.ts
readlink -f ~/.config/opencode/skills/nono-sandbox
jq '[.packages[] | select(type == "object" and (.source? // "" | contains("/share/nono-packs/packs/pi")))] | length == 1' \
  ~/.pi/agent/settings.json
```

Claude's `known_marketplaces.json`, `installed_plugins.json`, and
`settings.json::enabledPlugins` are not managed for this plugin.
