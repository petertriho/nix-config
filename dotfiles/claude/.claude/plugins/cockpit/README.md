# Cockpit

Cockpit is a Claude Code plugin that adds five read-only views and a band above the prompt. It does not change the status line, prompts, tool results, or permission dialogs.

The plugin needs Claude Code 2.1.292 or later for the early-access function-hook API. A later engine release can change this API.

## Views

| View | Content | Data source |
| --- | --- | --- |
| Agents | Session summary, plan, agent tree, and a detail card for the selected agent with its status, tokens, models, tool mix, todos, recent tools, and last answer | Native agent, turn, and tool events |
| Tools | Totals with approval counts, running calls, the call log with actor filters, a detail card, time per tool, background tasks, and crons | Native tool, permission, task notification, and turn events |
| Changes | Branch and totals, file groups by Git state with diffstat bars, the selected diff, checks, review findings, and Git activity | Native edit and shell results, and requested Git reads |
| Context | Fill gauge with the auto-compact mark, headroom and trend, category estimates, a token table, cost and rate limits, largest consumers, and compactions | Local summary and native measurements |
| Activity | Bongo Cat, activity counts and history, a timeline per actor, and a summary of where the time went | Observed tool, agent, and turn activity |

### Band

The band shows up to two rows above the prompt. A `◉` button before the rows opens the pane. The pane opens only from this button or a `/cockpit` command.

The first row shows what runs now. It shows only while work runs, while agents are live, or after a failure. It has these parts, in priority order:

1. The status: a spinner, the lead tool, and its elapsed time, with `+N` for each other running call. While a turn runs with no running tool, the status is "thinking".
2. A chip for each live agent, with its name and elapsed time.
3. At the right end, a sparkline of the activity level over the last 5 minutes, in steps of 30 seconds.

After a turn stops on an API error, the status shows "stopped: API error" in red until the next turn starts. The pane header also shows the error message from the transcript. After another failed turn, the status shows `✗ last turn failed`.

The second row shows where the work stands. It has these parts, in priority order:

1. Plan progress: a bar, the done and total counts, and the item in progress, such as `1/3 Writing tests`. A finished plan stays only while a turn runs.
2. The latest check result, such as `✗ npm test 2/42 failed`. An edit after the check dims the result and adds `(stale)`.
3. Changed files, added and removed lines, and a bar of five cells that splits the lines into additions and deletions.
4. A compaction warning, such as `⟳ ~4 replies to compact`. It shows only near the auto-compact threshold: yellow from 10 points before the threshold, and red at the threshold.

When a row is too narrow, the parts that have a short form use it. Then the parts with the lowest priority drop out. When the space above the prompt has fewer rows, the band keeps its first rows.

The band does not show the model, the context fill, the cost, or the turn time. The `claude-statusline` script and the engine show them.

When you open the transcript of a subagent, the band follows that agent. The first row starts with the name of the agent, then its lead tool or its status. The second row shows the plan of that agent.

The spinner turns four times a second while work runs. When the animation setting is off, the status shows a static `▸`.

### Header

The pane header shows the model, the session status, a context meter, the cost, the number of turns, and the session time.

Below the header, each view tab shows a count:

- Agents: the number of agents, or the number of live agents with `▸` while agents run.
- Tools: the number of tool calls, or the number of running calls with `▸` while calls run.
- Changes: the number of changed files.
- Context: the context fill.

An accent mark under the active tab shows the selected view. In a narrow pane, the tabs drop their counts first. Then the tabs wrap onto more than one row, in order.

### Agents

The session summary shows the current status, the turn count, and the average turn time. It also shows failed tool calls, token totals with the cache hit rate, and live agents.

The plan comes from the last `TodoWrite` result of the main thread and from the task tools (`TaskCreate`, `TaskUpdate`, `TaskList`). The plan list shows the items near the item in progress. The plan of a subagent appears in the detail card of that agent.

A completed `Agent` call reports run totals: tokens, tool uses, duration, changed lines, and models. The detail card shows the last answer of the agent as Markdown. An agent without run totals shows the usage of its last turn. "Show its tools" opens the Tools view, filtered to that agent.

When the transcript in view changes to a subagent, the pane selects that agent. A selection that you make stays until the transcript in view changes again.

### Tools

The summary shows the total tool time and the number of approval prompts. "Running now" lists the running calls, newest first. A call that waits for a permission answer shows a `?` mark.

The time of a call starts when the engine starts the call and stops when the call returns. This time includes the permission dialog and hooks. The detail card of a call that asked for permission shows "Approval asked".

"By tool" ranks the tools by total time, with call and failure counts. `Agent` calls are counted but get no bar, because their time is the time of the subagent.

Background tasks come from `Bash` calls with `run_in_background`, `Agent` calls with `run_in_background`, and `Monitor` calls. The task notification in the transcript gives the end status, such as completed, failed, or killed. A `TaskStop` call marks a task as stopped. The end of the last turn of a background agent also marks the agent as ended.

Crons appear below the background tasks. They come from `CronCreate`, `CronDelete`, and `ScheduleWakeup` calls. A one-shot cron leaves the list when its prompt fires. A `/loop` wakeup shows the time until it fires.

### Changes

The view groups files as staged, changed, untracked, and edited but not yet read from Git. Each row shows the Git state, the path, the number of observed edits, the number of findings, a diffstat bar, and the line counts. The diff heading names the agent that made the last edit.

Git activity comes from shell results that the engine marks as commits, pushes, branch changes, or pull requests. A pull request with an `https` URL shows a link.

### Context

The gauge scales the category estimates to the live fill and marks the auto-compact threshold. The headroom line shows the tokens left before auto-compact.

The engine measures the fill after each model response. The trend line shows the average growth of the last five measurements that grew. It also estimates the number of responses left before auto-compact.

The Compactions section shows the number of recorded compactions. It lists the last five with their trigger, token counts, and reduction.

Cost per turn is the difference between consecutive cost measurements of the main thread.

### Activity

The Activity view shows the phase, the number of running tools and agents, the activity history, and a pause control. It also has these parts:

- **Bongo Cat** acts out the session. It sleeps on the drums when idle and taps while the model thinks. While tools run, it drums on the bongos, faster with more work at once. After an error, it holds its paws up. A speech bubble names the lead tool and its elapsed time.
- **Timeline** shows one lane for the main thread and one for each recent agent. Each cell shows model time, a tool, a delegated agent, or an error. "Zoom" changes the span between the session and the last 5, 15, or 60 minutes.
- **Where time went** shows the busy share of the session, tool time by tool, agent time, the number of approval prompts, parallel work, and the call rate.

The cat is braille line art based on the original Bongo Cat. The table edge falls to the right, the face tilts with it, and the two bongos stand in front. A raised paw shows its toe beans, and a hit shows impact lines. The cat is 40 columns wide, or 34 or fewer in a narrow pane. It uses theme colors.

### Preferences

The selected view, the band setting, the animation setting, and the timeline zoom persist across sessions in plugin storage. A saved `reactor` view opens the Activity view. `reactor` is the name of the view that Activity replaced. Storage errors go to the debug log and do not block the commands.

### Colors

The pane does not paint a background. In the terminal dock, the engine fills the pane with the `composerSidebarBackground` color of the Claude Code theme. A plugin cannot paint the default terminal background over this fill.

All text and border colors are Claude Code theme keys, such as `suggestion`, `success`, and `inactive`. An ANSI theme, such as `dark-ansi`, draws these keys with the terminal palette.

A hex value or a color name is a fixed RGB value. In tmux, Claude Code limits output to 256 colors unless `CLAUDE_CODE_TMUX_TRUECOLOR` is set. With 256 colors, a hex value changes to the nearest xterm color.

This configuration makes the dock match the terminal background:

- Home Manager writes the custom theme `~/.claude/themes/stylix.json`. The theme extends the ANSI theme for the Stylix polarity and sets `composerSidebarBackground` to Stylix `base00`.
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
2. Press `Ctrl+X Tab` to focus the pane.
3. While the pane has focus, press `1` through `5` to select a view.
4. Press `Tab` to move between controls.
5. To resize a docked pane, press `Ctrl+X ←` to widen it or `Ctrl+X →` to narrow it.
6. To resize a pane above the prompt, press `Ctrl+X ↑` to make it taller or `Ctrl+X ↓` to make it shorter.
7. Press `Esc` to close the pane.

While the pane has focus, the views also have letter keys:

| Key | Agents | Tools | Changes | Context | Activity |
| --- | --- | --- | --- | --- | --- |
| `r` | Refresh agents | | Read Git | Estimate categories | |
| `j` / `k` | Next or previous agent | Older or newer call | Next or previous file | | |
| `t` | Show its tools | | | | |
| `p` | | | Copy the file path | | Pause or wake the cat |
| `c` / `q` | | | Copy or quote the patch | | |
| `z` | | | | | Change the timeline zoom |

The pane uses native scrolling and resizing. The pane asks for 58 columns in the dock and 24 rows above the prompt. A size that you set has priority over this request. The footer shows the resize keys for the current placement. Every view fits its layout to the new size.

## Data and limits

History starts when the plugin loads and stays in session memory. Hot reload keeps this memory, and `/clear` removes it.

Session memory holds at most these items:

- 200 tool calls.
- 100 agent records and 100 turns.
- 4,000 characters of the last answer of each agent.
- 20 todo lists of 50 items each, and 100 tasks.
- 40 background tasks.
- 100 changed files, 100 findings, 40 check summaries, and 30 Git operations.
- 24,000 characters of patch per file, and 200,000 characters of patch in total.
- 20 compactions, 100 cost measurements, and 100 fill measurements.
- 240 samples of activity history.

Agent status comes from the engine roster. An external teammate can keep an old status after its terminal closes. An agent that is missing from the roster shows an unknown status. This status does not prove that the agent stopped.

Tool durations measure the call, not the full life of a background process. Server-side tools appear only after the response that used them. Passive tool hooks do not give general live stdout.

No event reports when you answer a permission dialog. As a result, the approval mark stays until the tool finishes, and the band does not show it. The time of a call that asked for permission includes the time that the dialog waited for you.

The plugin uses no classic hook events (`classic.*`). On a machine with managed settings, and for Team and Enterprise organizations, the built-in `cc-plugin-sec-default` plugin runs first and sends each classic event past installed plugins. As a result, the plugin cannot get these data:

- The execution time of a tool without the permission dialog and hooks (`PostToolUse`).
- The list of background tasks and crons at each stop (`Stop`).
- The kind of an API error, such as `rate_limit` (`StopFailure`).

A shell or monitor task ends in the view only when the transcript draws its notification. In a session without a surface that draws the transcript, the task stays running.

Crons change only from tool calls. A recurring cron that expires after 7 days stays in the list. A one-shot cron stays in the list if its fired prompt differs from the prompt that scheduled it.

Check summaries read the known output formats of Jest, Vitest, pytest, cargo, and Go. For unknown output, the check shows a completed call and does not invent a pass count. A background check keeps its last reported state.

The context summary estimates the categories locally. It makes no token-count API request. Live input counts come from the last response. They are unknown before the first response and after a compaction.

The cost figure comes from the engine ledger. It is not a statement of account billing. Category estimates can differ from the live input count.

The Activity view shows relative observed activity, not an exact running token rate. The activity history records each change in the number of running tools, running agents, and main turns, also while the pane is closed. The cat animates only while the Activity view is visible. The pause control changes the animation setting, so it stops the cat and the band spinner.

The timeline knows the start and end of each tool call and main turn. Model time is the part of a turn without a running tool. An agent lane starts when the plugin first observes the agent.

While work runs, elapsed times redraw once a second, also while the pane is closed. A running tool, a main turn, and a running agent are work. The band spinner redraws only the band.

## Safety

The plugin observes existing work. It does not automatically start builds, reviews, browser capture, model requests, or HTTP requests.

The plugin reads Git only when you select the Changes view or press its refresh control. The Git commands use argument vectors, disable external diff drivers and text conversion, and disable filesystem monitor commands.

The plugin does not keep raw prompts, shell command arguments, or shell output, with one exception. A recognized check keeps a short label: the executable and its check subcommand or script, such as `cargo test` or `npm run test:unit`. Other `Bash` calls show only the executable name. A background shell task shows its description or its executable name, not its command. A cron shows its schedule, not its prompt.

Patches, finding summaries, todo text, and the last answer of each agent stay in bounded session memory. The plugin does not write them to disk. Plugin storage holds only the view, band, animation, and zoom preferences.

"Copy path" puts the path of the selected file on the clipboard. The path is relative to the repository root, as the file list shows it. For a file outside the repository, the full path is copied. "Copy patch" puts the patch on the clipboard. "Quote patch" adds the patch to the end of the draft. It does not submit the draft or replace existing text.

Observation errors go to the debug log. They do not change tool arguments, results, permission decisions, or streamed chunks. Existing shell hooks stay active.

## Nix integration

The tracked source is `dotfiles/claude/.claude/plugins/cockpit/`. Home Manager links the complete plugin root directly through `home.file.".claude/skills/cockpit".source`, with an out-of-store symlink.

Claude Code loads each folder in `~/.claude/skills/` that has a `.claude-plugin/plugin.json` file as a user plugin. No `--plugin-dir` flag or `enabledPlugins` entry is necessary. `claude plugin list` shows the plugin as `cockpit@skills-dir`. An interactive session watches the folder and reloads the hooks module after a file changes.

The generic managed-plugin wrapper can cache a manifest-only entry for an out-of-store source. The direct link keeps the original manifest, type contract, and hook modules.

The nono profile grants read access to the tracked target. The generated SDK declarations are optional at runtime. A sandbox can refuse to write the declarations next to the source, and the plugin does not need write access to the whole source.

Nothing in the plugin activates Home Manager or rebuilds NixOS. The link appears after the usual configuration activation.

### Development loading

The skills folder link already loads the tracked source in each session. Use `--plugin-dir` only where the link does not exist:

```sh
claude --plugin-dir "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
```

An interactive session hot-reloads a development path. A session development mod needs a separate hot-reload approval from the person.

### Checks

1. Run the native source check:

   ```sh
   claude plugin validate --strict "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
   ```

2. Run the behavior tests:

   ```sh
   claude plugin test "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
   ```

3. After the engine generates the SDK declarations, run the TypeScript check:

   ```sh
   tsc -p "$HOME/.nix-config/dotfiles/claude/.claude/plugins/cockpit"
   ```

The engine generates `.claude-plugin/types/` after a normal plugin load. The generated declarations describe the current engine and the connected tools. Git ignores this directory.

The tests use the native test engine, explicit surfaces, and mocked host operations. They cover descriptions and interactions, not the actual paint of the renderer.

## Source structure

- `hooks/register.tsx` holds hooks, host operations, literal state references, the band, and the pane header.
- `hooks/state.ts` holds initial state factories. It also fills the fields that state from an earlier version does not have.
- `hooks/data.ts` holds bounded parsers and observation helpers.
- `hooks/summary.ts` derives the status, totals, plan, context fill, activity history, and band rows from state.
- `hooks/layout.tsx` holds shared drawing blocks: lines, headings, fields, cards, actions, and tabs.
- `hooks/agents.tsx`, `hooks/tools.tsx`, `hooks/changes.tsx`, `hooks/context.tsx`, and `hooks/activity.tsx` draw one view each.
- `hooks/theme.ts` holds shared theme-key colors and text formatting.
- `types/index.d.ts` declares the self-contained state contract.
- `tests/` holds parser, summary, view, lifecycle, and safety tests. `tests/kit.tsx` holds the shared fixtures.

The native source analyzer follows host capabilities only through top-level functions in the hooks module. It does not follow `$` across imported helpers.
