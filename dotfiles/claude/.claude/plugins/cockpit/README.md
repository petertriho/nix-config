# Cockpit

Cockpit adds six read-only views to Claude Code. It keeps the existing status line, prompts, tool results, and permission dialogs unchanged.

The mod uses the early-access function-hook API from Claude Code 2.1.291. A later engine release can change this API.

## Views

| View | Content | Data source |
| --- | --- | --- |
| Agents | Agent hierarchy, reported status, recent tools, and completed token usage | Native agent and turn events |
| Tools | Tool timeline, duration bars, outcomes, and agent filters | Native tool events |
| Changes | File list, unified diffs, existing review findings, and observed check summaries | Native edit results and requested Git reads |
| Context | Context heatmap, ranked category estimates, compaction threshold, rate limits, and cost ledger | Local summary and native measurements |
| Reactor | Animated braille reactor, activity history, and pause control | Observed tool and agent activity |
| Images | Local PNG preview, image selection, and metadata fallback | A file that the person selects |

A compact activity band appears above the prompt. The pane opens only after a command or button press.

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
/cockpit images
/cockpit images "/absolute/path/to/screenshot.png"
/cockpit band off
/cockpit band on
/cockpit close
/cockpit help
```

The command can run during a model turn. A quoted image path can contain spaces. Relative paths use the session directory, and `~/` uses `HOME`.

### Terminal controls

1. Run `/cockpit` to open the pane.
2. Use `Ctrl+X Tab` to focus the pane.
3. While the pane has focus, press `1` through `6` to select a view.
4. Press `Tab` to move between controls.
5. Press `Esc` to close the pane.

The pane uses native scrolling and resizing. The images view has a text field on terminal, desktop, and VS Code surfaces. Mobile uses the command path instead.

## Data and limits

History starts when the mod loads. Session memory holds the history. Hot reload keeps that memory, and `/clear` removes it.

- The timeline holds at most 200 tool calls.
- The agent view holds at most 100 agent records.
- The review view holds at most 100 files, 100 findings, and 40 check summaries.
- Review patches hold at most 24,000 characters per file and 200,000 characters in total.
- The image view holds at most eight file records.

Agent status comes from the engine roster. An external teammate can leave an old status after its terminal closes. Missing entries show an unknown status, not proof that an agent stopped.

Tool durations measure the call, not the full life of a background process. Server-side tools appear retrospectively after the response. General live stdout is not available through passive tool hooks.

Check summaries use known Jest, Vitest, pytest, cargo, and Go output formats. Unknown output shows a completed call without an invented pass count. A background check retains its last reported state.

The context summary estimates categories locally. It makes no token-count API request. Live input counts come from the last response and remain unknown before a response or after compaction.

The cost figure is the engine ledger, not a statement of account billing. Category estimates can differ from the live input count.

The reactor shows relative observed activity, not an exact running token rate. Animation runs only in the visible reactor view. The pause control stops frame updates.

The reactor draws its orb as braille text on every surface. The orb uses theme colors and the background of the surface.

### Images

The image view accepts local PNG files, not URLs or network paths. Existing filesystem and sandbox access still applies.

The mod checks the PNG header, dimensions, and size. The image must not exceed 2 MiB, 8,192 pixels per dimension, or 16,000,000 pixels in total.

Each successful load changes the image revision. A reload reads new pixels even when the path stays the same.

The terminal renderer decodes the image. Compatible Kitty-protocol terminals, such as Kitty and Ghostty, show the pixels. Other terminals show alternative text, and remote surfaces show metadata.

SSH and tmux can limit terminal graphics. The metadata fallback remains available. Native Linux audio playback is not part of this mod.

## Safety

The mod observes existing work. It does not start builds, reviews, browser capture, model requests, or HTTP requests automatically.

Git reads happen only after the changes view or its refresh control is requested. The commands use argument vectors, disable external diff drivers and text conversion, and disable filesystem monitor commands.

The mod does not retain raw prompts, shell command arguments, or shell output. Review patches and finding summaries remain in bounded session memory. The mod does not write them to disk.

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
- `hooks/state.ts` holds initial state factories.
- `hooks/data.ts` holds bounded parsers and observation helpers.
- `hooks/operations.tsx` draws agent, tool, and change views.
- `hooks/visuals.tsx` draws context, reactor, and image views.
- `hooks/theme.ts` holds shared theme-key colors and text formatting.
- `types/index.d.ts` declares the self-contained state contract.
- `tests/` holds parser, view, lifecycle, and safety tests.

The native source analyzer follows host capabilities only through top-level functions in the hooks module. It does not follow `$` across imported helpers.
