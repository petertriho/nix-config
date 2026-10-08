# Cockpit

Cockpit adds five read-only views to Claude Code. It keeps the existing status line, prompts, tool results, and permission dialogs unchanged.

The mod uses the early-access function-hook API from Claude Code 2.1.292. A later engine release can change this API.

## Views

| View | Content | Data source |
| --- | --- | --- |
| Agents | Plan, agent hierarchy, reported status, recent tools, run totals, and last answer | Native agent, turn, and tool events |
| Tools | Tool timeline, run time, approval and hook time, outcomes, background tasks, and agent filters | Native tool, permission, and stop events |
| Changes | File list, unified diffs, existing review findings, observed check summaries, and Git activity | Native edit and shell results, and requested Git reads |
| Context | Context heatmap, ranked category estimates, compactions, rate limits, and cost per turn | Local summary and native measurements |
| Reactor | Animated braille reactor, activity history, and pause control | Observed tool and agent activity |

A compact activity band appears above the prompt. It shows running agents and tools, plan progress, and background tasks. At 64 columns or more, it also shows the duration of the last main turn. After a turn stops on an error, the band shows the error in red until the next turn starts. The pane opens only after a command or button press.

### Agents

The plan comes from the last `TodoWrite` result of the main thread and from the task tools (`TaskCreate`, `TaskUpdate`, `TaskList`). A subagent plan appears under that agent.

A completed `Agent` call reports run totals: tokens, tool uses, duration, changed lines, and models. The last answer of an agent appears as Markdown. Agents without totals show the usage of their last turn.

When the transcript in view changes to a subagent, the pane selects that agent. A selection that you make stays until the transcript in view changes again.

### Tools

A finished tool shows two durations. "Ran" is the execution time that the engine reports. "Approval and hooks" is the remaining time of the call, which includes the permission dialog and hooks. A tool that waits for a permission answer shows "running · approval asked".

Background tasks come from `Bash` calls with `run_in_background`, `Agent` calls with `run_in_background`, and `Monitor` calls. The engine snapshot at each stop updates their status. Scheduled crons appear below the background tasks.

### Changes

Git activity comes from shell results that the engine marks as commits, pushes, branch changes, or pull requests. A pull request with an `https` URL shows a link.

### Context

The context view lists the last 20 compactions with their trigger and token counts. Cost per turn is the difference between consecutive cost measurements of the main thread.

### Preferences

The selected view, the band setting, and the animation setting persist across sessions in plugin storage. Storage errors go to the debug log and do not block the commands.

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
/cockpit reactor
/cockpit band off
/cockpit band on
/cockpit close
/cockpit help
```

The command can run during a model turn.

### Terminal controls

1. Run `/cockpit` to open the pane.
2. Use `Ctrl+X Tab` to focus the pane.
3. While the pane has focus, press `1` through `5` to select a view.
4. Press `Tab` to move between controls.
5. Press `Esc` to close the pane.

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
- The context view holds at most 20 compactions and 100 cost measurements.
- The activity history holds at most 240 samples.

Agent status comes from the engine roster. An external teammate can leave an old status after its terminal closes. Missing entries show an unknown status, not proof that an agent stopped.

Tool durations measure the call, not the full life of a background process. Server-side tools appear retrospectively after the response. General live stdout is not available through passive tool hooks.

No event reports when the person answers a permission dialog. The approval mark therefore stays until the tool finishes, and the band does not show it. "Approval and hooks" is known only after the call ends.

Background status updates only when a turn or subagent stops. A task that ends between stops keeps its last reported status until the next stop.

Check summaries use known Jest, Vitest, pytest, cargo, and Go output formats. Unknown output shows a completed call without an invented pass count. A background check retains its last reported state.

The context summary estimates categories locally. It makes no token-count API request. Live input counts come from the last response and remain unknown before a response or after compaction.

The cost figure is the engine ledger, not a statement of account billing. Category estimates can differ from the live input count.

The reactor shows relative observed activity, not an exact running token rate. The activity history records each change in the number of running tools, running agents, and main turns, also while the pane is closed. Animation runs only in the visible reactor view. The pause control stops frame updates.

The reactor draws its orb as braille text on every surface. The orb uses theme colors and the background of the surface.

## Safety

The mod observes existing work. It does not start builds, reviews, browser capture, model requests, or HTTP requests automatically.

Git reads happen only after the changes view or its refresh control is requested. The commands use argument vectors, disable external diff drivers and text conversion, and disable filesystem monitor commands.

The mod does not retain raw prompts, shell command arguments, or shell output. A background shell task shows its description or its executable name, not its command. A cron shows its schedule, not its prompt.

Review patches, finding summaries, todo text, and the last answer of each agent remain in bounded session memory. The mod does not write them to disk. Plugin storage holds only the view, band, and animation preferences.

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

- `hooks/register.tsx` holds hooks, host operations, and literal state references.
- `hooks/state.ts` holds initial state factories and fills missing fields in state from an earlier version.
- `hooks/data.ts` holds bounded parsers and observation helpers.
- `hooks/operations.tsx` draws agent, tool, and change views.
- `hooks/visuals.tsx` draws context and reactor views.
- `hooks/theme.ts` holds shared theme-key colors and text formatting.
- `types/index.d.ts` declares the self-contained state contract.
- `tests/` holds parser, view, lifecycle, and safety tests.

The native source analyzer follows host capabilities only through top-level functions in the hooks module. It does not follow `$` across imported helpers.
