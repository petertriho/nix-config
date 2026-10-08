# Cockpit

Cockpit adds five read-only views to Claude Code. It keeps the existing status line, prompts, tool results, and permission dialogs unchanged.

The mod uses the early-access function-hook API from Claude Code 2.1.292. A later engine release can change this API.

## Views

| View | Content | Data source |
| --- | --- | --- |
| Agents | Session summary, plan, agent tree, and a detail card for the selected agent with its status, tokens, models, tool mix, todos, recent tools, and last answer | Native agent, turn, and tool events |
| Tools | Totals with approval wait, running calls, the call log with actor filters, a detail card, time per tool, background tasks, and crons | Native tool, permission, and stop events |
| Changes | Branch and totals, file groups by Git state with diffstat bars, the selected diff, checks, review findings, and Git activity | Native edit and shell results, and requested Git reads |
| Context | Fill gauge with the auto-compact mark, headroom and trend, category estimates, a token table, cost and rate limits, largest consumers, and compactions | Local summary and native measurements |
| Activity | Bongo Cat, activity counts and history, a timeline per actor, and a summary of where the time went | Observed tool, agent, and turn activity |

### Band

A compact band appears above the prompt. It shows these parts, in priority order:

1. The status: the lead tool and its elapsed time, "thinking" with the turn time, or "idle".
2. Plan progress, such as `1/3 Writing tests`.
3. Running agents.
4. The context fill, colored before auto-compact.
5. The latest check result, such as `✗ npm test 2 failed`.
6. Changed files with added and removed lines.
7. The session cost.
8. Running background tasks.
9. The duration of the last main turn, only when idle.

When the band is too narrow, each part changes to a short form first. Then the parts with the lowest priority drop out. After a turn stops on an error, the band shows the error in red until the next turn starts. The pane opens only after a command or button press.

### Header

The pane header shows the model, the session status, a context meter, the cost, the number of turns, and the session time. Below it, the view tabs show counts: agents and tool calls, with `▸` when some are running, changed files, and the context fill. The active tab has an accent mark under it. A narrow pane drops the counts first, and then puts the tabs on more than one row, in order.

### Agents

The session summary shows the current status, the turn count and average turn time, failed tool calls, token totals with the cache hit rate, and live agents.

The plan comes from the last `TodoWrite` result of the main thread and from the task tools (`TaskCreate`, `TaskUpdate`, `TaskList`). The list shows the items near the one in progress. A subagent plan appears in the detail card of that agent.

A completed `Agent` call reports run totals: tokens, tool uses, duration, changed lines, and models. The last answer of an agent appears as Markdown. Agents without totals show the usage of their last turn. "Show its tools" opens the Tools view, filtered to that agent.

When the transcript in view changes to a subagent, the pane selects that agent. A selection that you make stays until the transcript in view changes again.

### Tools

The summary shows the total tool time, the number of approval prompts, and the time spent waiting for an answer. "Running now" lists the running calls with the lead call first.

A finished tool shows two durations. "Ran" is the execution time that the engine reports. "Approval" is the remaining time of the call, which includes the permission dialog and hooks. A tool that waits for a permission answer shows a `?` mark.

"By tool" ranks the tools by total time, with call and failure counts. `Agent` calls are counted but get no bar, because their time is the time of the subagent.

Background tasks come from `Bash` calls with `run_in_background`, `Agent` calls with `run_in_background`, and `Monitor` calls. The engine snapshot at each stop updates their status. Scheduled crons appear below the background tasks.

### Changes

Files are grouped as staged, changed, untracked, and edited but not yet read from Git. Each row shows the Git state, the path, the number of observed edits, the number of findings, a diffstat bar, and the line counts. The diff heading names the agent that made the last edit.

Git activity comes from shell results that the engine marks as commits, pushes, branch changes, or pull requests. A pull request with an `https` URL shows a link.

### Context

The gauge scales the category estimates to the live fill and marks the auto-compact threshold. The headroom line shows the tokens left before auto-compact. The engine measures the fill after each model response. The trend line shows the average growth of the last five measurements that grew, and an estimate of the responses left before auto-compact.

The context view lists the last 20 compactions with their trigger, token counts, and reduction. Cost per turn is the difference between consecutive cost measurements of the main thread.

### Activity

The Activity view replaces the reactor view of earlier versions. The reactor drew an animated orb with an activity history. The orb was decorative, and the other views already showed the counts. The Activity view keeps the phase, the counts, the history, and the pause control, and adds these parts:

- **Bongo Cat** acts out the session. It sleeps on the drums when idle, taps while the model thinks, and drums on the bongos while tools run, faster with more work at once. After an error, it holds its paws up. A speech bubble names the lead tool and its elapsed time.
- **Timeline** shows one lane for the main thread and one for each recent agent. Each cell shows the model, a tool, a delegated agent, an approval wait, or an error. "Zoom" changes the span between the session and the last 5, 15, or 60 minutes.
- **Where time went** shows the busy share of the session, tool time by tool, agent time, approval wait, parallel work, and the call rate.

### Preferences
### Preferences

The selected view, the band setting, the animation setting, and the timeline zoom persist across sessions in plugin storage. A saved `reactor` view opens the Activity view. Storage errors go to the debug log and do not block the commands.

### Colors

The pane does not paint a background. In the terminal dock, the engine fills the pane with the `composerSidebarBackground` color of the Claude Code theme. A plugin cannot paint the default terminal background over this fill.

All text and border colors are Claude Code theme keys, such as `suggestion`, `success`, and `inactive`. An ANSI theme, such as `dark-ansi`, draws these keys with the terminal palette.

Hex values and color names are fixed RGB values. Claude Code limits output to 256 colors in tmux unless `CLAUDE_CODE_TMUX_TRUECOLOR` is set. In that mode, a hex value changes to the nearest xterm color.

This configuration makes the dock match the terminal background:

- Home Manager writes the custom theme `~/.claude/themes/stylix.json`. The theme extends the ANSI theme for the Stylix polarity, and sets `composerSidebarBackground` to Stylix `base00`.
- `settings.json` selects `custom:stylix` and sets `CLAUDE_CODE_TMUX_TRUECOLOR` to `1`. Without truecolor, tmux sessions round `base00` to a gray xterm color.

## Commands

```text
/cockpit
/cockpit agents
/cockpit tools
/cockpit changes
/cockpit context
/cockpit activity
/cockpit band off
/cockpit band on
/cockpit close
/cockpit help
```

The command can run during a model turn. `/cockpit reactor` is an alias for `/cockpit activity`.

### Terminal controls

1. Run `/cockpit` to open the pane.
2. Use `Ctrl+X Tab` to focus the pane.
3. While the pane has focus, press `1` through `5` to select a view.
4. Press `Tab` to move between controls.
5. Press `Esc` to close the pane.

The views also have letter keys while the pane has focus:

| Key | Agents | Tools | Changes | Context | Activity |
| --- | --- | --- | --- | --- | --- |
| `r` | Refresh agents | | Read Git | Estimate categories | |
| `j` / `k` | Next or previous agent | Older or newer call | Next or previous file | | |
| `t` | Show its tools | | | | |
| `c` / `q` | | | Copy or quote the patch | | |
| `z` / `p` | | | | | Zoom, pause or wake the cat |

The pane uses native scrolling and resizing.

## Data and limits

History starts when the mod loads. Session memory holds the history. Hot reload keeps that memory, and `/clear` removes it.

- The timeline holds at most 200 tool calls.
- The agent view holds at most 100 agent records and 100 turns.
- Each agent holds at most 4,000 characters of its last answer.
- The plan holds at most 20 todo lists of 50 items each, and 100 tasks.
- The background list holds at most 40 tasks.
- The review view holds at most 100 files, 100 findings, 40 check summaries, and 30 Git operations.
- Review patches hold at most 24,000 characters per file and 200,000 characters in total.
- The context view holds at most 20 compactions, 100 cost measurements, and 100 fill measurements.
- The activity history holds at most 240 samples.

Agent status comes from the engine roster. An external teammate can leave an old status after its terminal closes. Missing entries show an unknown status, not proof that an agent stopped.

Tool durations measure the call, not the full life of a background process. Server-side tools appear retrospectively after the response. General live stdout is not available through passive tool hooks.

No event reports when the person answers a permission dialog. The approval mark therefore stays until the tool finishes, and the band does not show it. "Approval and hooks" is known only after the call ends.

Background status updates only when a turn or subagent stops. A task that ends between stops keeps its last reported status until the next stop.

Check summaries use known Jest, Vitest, pytest, cargo, and Go output formats. Unknown output shows a completed call without an invented pass count. A background check retains its last reported state.

The context summary estimates categories locally. It makes no token-count API request. Live input counts come from the last response and remain unknown before a response or after compaction.

The cost figure is the engine ledger, not a statement of account billing. Category estimates can differ from the live input count.

The cat is braille line art after the original Bongo Cat: the table edge falls to the right, the face tilts with it, and the two bongos stand in front. A raised paw shows its toe beans, and a hit shows impact lines. The cat is 40 columns wide, or 34 or fewer in a narrow pane, and uses theme colors.

The Activity view shows relative observed activity, not an exact running token rate. The activity history records each change in the number of running tools, running agents, and main turns, also while the pane is closed. The cat animates only in the visible Activity view. The pause control stops frame updates.

The timeline knows the start and end of each tool call and main turn. Model time is the part of a turn without a running tool. An agent lane starts when the mod first observes the agent.

While work runs, elapsed times redraw once a second, also while the pane is closed, so the band stays current.

## Safety

The mod observes existing work. It does not start builds, reviews, browser capture, model requests, or HTTP requests automatically.

Git reads happen only after the changes view or its refresh control is requested. The commands use argument vectors, disable external diff drivers and text conversion, and disable filesystem monitor commands.

The mod does not retain raw prompts, shell command arguments, or shell output. A background shell task shows its description or its executable name, not its command. A cron shows its schedule, not its prompt.

Review patches, finding summaries, todo text, and the last answer of each agent remain in bounded session memory. The mod does not write them to disk. Plugin storage holds only the view, band, animation, and zoom preferences.

Copy places a patch on the clipboard. Quote appends a patch to the draft. Quote does not submit the draft or replace existing text.

Observation errors go to the debug log. They do not change tool arguments, results, permission decisions, or streamed chunks. Existing shell hooks remain active.

## Nix integration

The tracked source is `dotfiles/claude/.claude/plugins/cockpit/`. Home Manager links the complete root directly through `home.file.".claude/skills/cockpit".source`.

The generic managed-plugin wrapper can cache a manifest-only entry for an out-of-store source. The direct link preserves the original manifest, type contract, and hook modules.

The nono profile grants read access to the tracked target. Generated SDK declarations are optional for runtime use. A sandbox can refuse adjacent declaration writes without requiring source-wide write access.

The implementation does not activate Home Manager or rebuild NixOS. The persistent link appears after the usual configuration activation.

### Development loading

1. Run Claude Code with the tracked plugin path.

```sh
claude --plugin-dir "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
```

Interactive development paths support hot reload. Session development mods need the separate hot-reload approval from the person.

### Checks

1. Run the native source check.

```sh
claude plugin validate --strict "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
```

2. Run the behavior tests.

```sh
claude plugin test "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
```

3. After the engine generates SDK declarations, run the TypeScript check.

```sh
tsc -p "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
```

The engine generates `.claude-plugin/types/` after a normal mod load. The generated declarations describe the current engine and connected tools. Git ignores this directory.

The tests use the native test engine, explicit surfaces, and mocked host operations. They cover descriptions and interactions, not the actual renderer paint.

## Source structure

- `hooks/register.tsx` holds hooks, host operations, literal state references, the band, and the pane header.
- `hooks/state.ts` holds initial state factories and fills missing fields in state from an earlier version.
- `hooks/data.ts` holds bounded parsers and observation helpers.
- `hooks/summary.ts` derives the status, totals, plan, context fill, and band parts from state.
- `hooks/layout.tsx` holds shared drawing blocks: lines, headings, fields, cards, actions, and tabs.
- `hooks/agents.tsx`, `hooks/tools.tsx`, `hooks/changes.tsx`, `hooks/context.tsx`, and `hooks/activity.tsx` draw one view each.
- `hooks/theme.ts` holds shared theme-key colors and text formatting.
- `types/index.d.ts` declares the self-contained state contract.
- `tests/` holds parser, summary, view, lifecycle, and safety tests. `tests/kit.tsx` holds the shared fixtures.

The native source analyzer follows host capabilities only through top-level functions in the hooks module. It does not follow `$` across imported helpers.
