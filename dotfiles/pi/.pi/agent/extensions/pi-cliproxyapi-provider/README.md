# CLIProxyAPI provider, quota popup, and automatic resume

The CLIProxyAPI provider supports quota inspection and opt-in automatic resume for signed-in Codex accounts.

| Command | Result |
| --- | --- |
| `/quota` | Opens the quota popup in TUI mode. Other modes retain plain-text notifications. |
| `/quota-resume` | Toggles automatic resume. |
| `/quota-resume on` | Enables automatic resume. |
| `/quota-resume off` | Disables automatic resume and cancels an active quota wait. |
| `/quota-resume status` | Shows the current mode. |

Automatic resume is off by default. The provider saves the mode in `~/.pi/agent/cliproxyapi.json` as `quotaResume`.
The model header shows `quota resume` when the mode is on. During a wait, it shows the reset time and remaining duration.

## Entry and modules

Home Manager links the complete `pi-cliproxyapi-provider/` folder. Pi discovers its sole entry, `index.ts`, automatically.
For explicit loading, use the new entry:

```sh
pi -e ~/.pi/agent/extensions/pi-cliproxyapi-provider/index.ts
```

There is no compatibility shim for the previous file entry. Update external `-e` commands before restart.
The source move does not change `cliproxyapi.json`, `cliproxyapi-models.json`, or `tmp/models-dev-cache.json`. No data migration is necessary.

| Module | Responsibility |
| --- | --- |
| `index.ts` | Provider/command registration, lifecycle, factory-owned state, and refresh guards. |
| `config.ts` | Pause, Fast, resume preferences, and management-key resolution. |
| `catalog.ts` | Endpoints, catalog mapping/capabilities, and current/legacy model caches. |
| `pricing.ts` | models.dev matching, context tiers, Fast rates, and price-cache fallback. |
| `stream.ts` | Manual pause gate, native Responses pricing/hooks, and transient errors. |
| `shared.ts` | Stable identifiers, guards, logging helpers, and atomic cache writes. |
| `quota.ts` | Bounded live inspection and separate model-eligibility/availability rules. |
| `resume.ts` | Automatic wait/retry/cancellation and request ownership. |
| `quota-ui.ts` | In-memory inspection modal, presentation, local countdowns, and keyboard controls. |

## Quota popup

`/quota` is the only opening action. There is no global opener or persistent quota widget.
The popup shows stacked account cards in API listing order. It does not pool accounts or identify the current routed account.
Roomy popups add blank rows around account dividers and separate cards from the status and shortcut hints.
When the body viewport has fewer than eight rows, the popup keeps compact spacing.

Compact cards show account-wide generation windows, their supplied durations, and reset countdowns.
Reset countdowns use the largest unit: `1.5d`, `2.3h`, `4.2m`, or `43s`.
Days, hours, and minutes use one decimal place. Seconds use whole numbers and round upward.
Bars fill with **used quota**, not remaining capacity. Labels show `% used` and, when space permits, `% left` with a zero floor.
Only the drawn fill stops at 100%. A valid 130% reading still says `130% used`.

Colors come from the active Pi theme: success below 80%, warning from 80% to below 95%, and error from 95%.
Explicit limit flags also say `limited`. Unknown or invalid usage says `usage unknown` without a healthy empty bar.
These colors are display thresholds, not automatic-resume rules.

Expand a card for exact reset timestamps, model windows, review windows, credit availability, and scheduler retry information.
Model windows identify their model or say `applicability unknown`. Review windows say `review only`.
Scheduler cooldowns remain separate from subscription limits. Credit availability does not report a balance or authorize a purchase.
Missing windows or resets remain unknown. Disabled accounts say `not probed`. Account errors remain visible when collapsed.
The account-wide check does not prove readiness for the selected model.

### Local shortcuts

| Action | Default keys |
| --- | --- |
| Move account focus | Up/Down, `k`/`j` |
| Toggle details | Enter |
| Expand | Right, `l` |
| Collapse | Left, `h` |
| Scroll a page within the body, including tall cards | PageUp/PageDown |
| Focus first/last account | Home/End |
| Run a live refresh | `r` |
| Toggle in-modal help | `?` |
| Finish inspection | Escape, `q` |

Pi's `tui.select.*` configuration controls selection, confirmation, paging, and cancellation actions. Vim aliases remain available.
Help shows the configured keys. Close and navigation remain available in help, loading, and error states.
Narrow footers prioritize refresh, close, and help. Page scrolling does not force the focused header back into view.

### Freshness and ownership

Each opening starts a fresh inspection. Only `r` starts another live check while the popup is open.
Repeated refresh input during an active check does not start concurrent requests. The popup preserves focus and expansion by account ID where possible.

The status shows the checked time and age. A failed whole refresh retains the original snapshot and timestamp with a **Stale** label.
A successful partial refresh shows current account failures, not old failed-account bars presented as fresh data.
Initial errors show safe retry/close guidance.

A local one-second timer updates countdowns and age only. It makes no network requests.
An elapsed reset says `refresh required`. It does not refill a bar, establish readiness, or trigger resume.
Snapshots exist only in the current modal's memory. They do not enter the transcript, model input, session entries, or disk history.

Escape or `q` completes the custom interaction and restores editor focus. Closure aborts only inspector-owned work and stops its timer.
It does not cancel an assistant request or automatic quota wait, disable resume, or release manual pause.
Shutdown/reload and invalidating session/model changes also complete the inspector. Only one interactive inspector can be open.
RPC and other non-TUI modes never open custom UI. They retain the original sanitized plain-text notification behavior.

## Authentication

Quota inspection needs a CLIProxyAPI management key. An inference API key alone is not sufficient.

The provider uses the first available key in this order:

1. `CLIPROXYAPI_MANAGEMENT_KEY` from the environment.
2. `managementKey` from `cliproxyapi.json`.
3. `CLI_PROXY_API_KEY` from the environment.

The last entry supports this repository's Nix launch wrapper, which uses that key as `MANAGEMENT_PASSWORD`.
Home Manager supplies `CLIPROXYAPI_MANAGEMENT_KEY` and links the complete provider folder.

The client targets the CLIProxyAPI 8.0.10 management routes. It uses legacy routes only after an HTTP 404.
CLIProxyAPI supplies the stored OAuth token during the upstream usage request. Pi does not read credential files or store OAuth tokens.
Quota snapshots stay in memory. Neither the popup nor notifications add quota data or management keys to model input.

## Resume behavior

The provider keeps the failed assistant request pending instead of adding a new user prompt.
The retry preserves the transcript, completed tool results, model, session identity, and request instrumentation.

CLIProxyAPI still selects the account. Sticky routing remains enabled, and normal account failover remains available.
A long wait can expire the proxy's sticky binding. Resume does not guarantee the same OpenAI account.

Automatic resume follows these rules:

- A confirmed subscription-quota error can start an account-pool check. A bare HTTP 429 cannot.
- A pool cooldown needs live evidence of subscription exhaustion before it can start a quota wait.
- The client checks model eligibility for enabled Codex accounts before it uses their reset times.
- Each account uses the latest reset among its exhausted, applicable windows.
- The pool uses the earliest recovery time among eligible accounts.
- A verified ready account permits one immediate retry if the proxy returned a subscription-quota error.
- After a wait, a fresh account-pool check must show availability before the provider retries.
- Unknown eligibility, authentication errors, missing reset times, and ambiguous quota data stop automatic resume.
- Review-only limits do not block ordinary generation. Unrelated model limits do not set its reset time.
- The provider refuses to replay partial text, thinking, tool calls, retained content, or charged requests.
- Manual `/pause` remains independent. `/continue` releases that gate but does not bypass the quota check.

The wait includes a two-second margin after the reported reset.
Each pending operation permits three quota retries and three reset rechecks per wait cycle.
Its deadline is eight days after the operation starts. It does not poll account quotas every second.
The one-second local tick updates the header and checks cancellation.

A safety stop prevents Pi's normal transient retry policy from restarting a confirmed quota wait.
The terminal error retains the original provider error. Ordinary transient errors still use Pi's normal retry policy.

## Cancellation and deployment

A wait cancels on abort, new input, model changes, session changes, tree navigation, compaction, shutdown, or `/quota-resume off`.
Cancellation does not submit another model request. It does not turn off an independent manual pause.
The pending request exists only in the current Pi process. Restarting Pi does not restore it.
Enabling the mode does not restart a turn that already ended.

1. Apply the Nix/Home Manager configuration.
2. Restart Pi.
3. Run `/quota`.
4. Run `/quota-resume on`.
5. Start the task.

If quota checks remain unavailable, check the management key and the account's authentication in CLIProxyAPI.
