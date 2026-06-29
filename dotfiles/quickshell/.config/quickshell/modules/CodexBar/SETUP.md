# CodexBar widget — provider setup

This widget is a **display layer only**: it shells out to
`codexbar usage` (every enabled provider in one call) plus, when Codex is among
the results, a second `codexbar usage --provider codex --all-accounts` call so
both Codex accounts stay visible and grouped — then parses the result
(see `codexbar.js`). CodexBar owns **all** provider/auth/API-key state in
`~/.config/codexbar/config.json`. No secrets ever enter the nix store.

Run the steps below once. Re-run `codex login` only when a token expires.

## 1. Codex / OpenAI — browser OAuth (NO api key)

The codexbar **CLI has no sign-in command** (verified: `codexbar login` →
`Unknown command`). OAuth credentials come from the OpenAI **Codex CLI** (`codex`),
which writes `~/.codex/auth.json`, which codexbar then reads. On macOS you sign in
through the codexbar *GUI app* (which delegates to this same codex CLI); the headless
Linux CLI has no such UI, so you run `codex login` directly. The credential model is
identical — only the sign-in UI differs.

```sh
# The codex CLI is required (OAuth auth + the CLI RPC usage source). Install if missing:
#   nix profile install nixpkgs#codex
codex login                       # default account — opens a browser; refreshes ~/.codex/auth.json

# Second account under its own home, then register it with codexbar:
CODEX_HOME=~/.codex-personal codex login
```

Then edit `~/.config/codexbar/config.json` and add the extra home(s) to the **codex**
provider object:

```json
{
  "id": "codex",
  "enabled": true,
  "codexProfileHomePaths": ["~/.codex-personal"]
}
```

codexbar reads identity from each home and scopes each fetch with `CODEX_HOME`.
Profile homes are **not** reauthenticated by codexbar — log in to each with `codex login`.
The default `~/.codex` is the managed account and needs no entry.

## 2. z.ai — Global / Singapore coding plan

```sh
printf '%s' "$Z_AI_API_KEY" | codexbar config set-api-key --provider zai --stdin
```

**No endpoint override is needed** — codexbar's default region is Global (`api.z.ai`),
which already returns the coding-plan quota (5-hour window + monthly).

## 3. OpenRouter — API key (balance/spend)

```sh
printf '%s' "$OPENROUTER_API_KEY" | codexbar config set-api-key --provider openrouter --stdin
```

OpenRouter is shown as a **cost row** (account balance) and is excluded from the bar's
auto-selected "most critical" meter, which only considers quota-window providers.

## Verify

```sh
codexbar usage --format json --pretty
# expect: Codex quota row(s) (one per account) + z.ai quota row + OpenRouter balance row
```

The widget polls on the timer in `config.qml` (`codexbar.refreshIntervalSec`, default 90s).
Bump the codexbar version later by changing `version` + the two hashes in
`pkgs/codexbar/default.nix`; if a provider's JSON shape changed, re-capture it here and
adjust `codexbar.js`.
