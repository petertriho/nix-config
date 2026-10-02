# Codex quota and automatic resume

The CLIProxyAPI provider supports quota inspection and opt-in automatic resume for signed-in Codex accounts.

| Command | Result |
| --- | --- |
| `/quota` | Shows account usage windows, reset times, credits, and unavailable checks. |
| `/quota-resume` | Toggles automatic resume. |
| `/quota-resume on` | Enables automatic resume. |
| `/quota-resume off` | Disables automatic resume and cancels an active quota wait. |
| `/quota-resume status` | Shows the current mode. |

The default mode is off. The provider saves the mode in `~/.pi/agent/cliproxyapi.json` as `quotaResume`.
The model header shows `quota resume` when the mode is on. During a wait, it shows the reset time and remaining duration.

## Authentication

Quota inspection needs a CLIProxyAPI management key. An inference API key alone is not sufficient.

The provider uses the first available key in this order:

1. `CLIPROXYAPI_MANAGEMENT_KEY` from the environment.
2. `managementKey` from `cliproxyapi.json`.
3. `CLI_PROXY_API_KEY` from the environment.

The last entry supports this repository's Nix launch wrapper, which uses that key as `MANAGEMENT_PASSWORD`.
Home Manager supplies `CLIPROXYAPI_MANAGEMENT_KEY` and links this helper directory beside the provider extension.

The client targets the CLIProxyAPI 8.0.10 management routes. It uses legacy routes only after an HTTP 404.
CLIProxyAPI supplies the stored OAuth token during the upstream usage request. Pi does not read credential files or store OAuth tokens.
Quota snapshots stay in memory. Notifications do not add quota data or management keys to model input.

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
