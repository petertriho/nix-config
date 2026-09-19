# pi-history

`pi-history` is a repository-owned Pi extension for durable prompt stashes and
searchable prompt history. Home Manager links this directory into Pi's global
extension directory, so it is available in every trusted project without a
package entry in `settings.json`.

The implementation targets Pi `0.85.1` on Node `24.x`. It uses Pi's native TUI
components and `node:sqlite`; it has no runtime npm dependencies.

## Stashing drafts

`Ctrl+S` acts on the editor for the exact directory where Pi started:

- With a non-empty draft, it persists the exact text, clears the editor, and
  updates the compact stash widget.
- With an empty editor and no stashes, it reports that no stashes exist.
- With an empty editor and one stash, it pops that stash directly into the
  editor.
- With an empty editor and multiple stashes, the compact widget yields to an
  expanded full-width picker above the editor. The editor remains mounted and
  visible while the picker owns keyboard input.

The stash picker supports:

| Key                                    | Action                                         |
| -------------------------------------- | ---------------------------------------------- |
| Enter                                  | Pop the selected stash: apply it and delete it |
| `Ctrl+A`                               | Apply the selected stash without deleting it   |
| `Ctrl+X`                               | Drop the selected stash                        |
| `/`                                    | Activate filtering by stash text or directory  |
| `Ctrl+P` / `Ctrl+N`                    | Move up / down with wrap-around                |
| Configured select arrows               | Move up / down with wrap-around                |
| Configured Page Up / Page Down         | Navigate by page with wrap-around              |
| Configured select cancel keys          | Close without changing the draft               |

After a drop, selection returns to the row above; dropping the first row
selects the next remaining row.

Applying or popping over a different non-empty draft first stores that draft in
the same atomic SQLite mutation. The transient widget feedback includes
`current draft auto-stashed`. A failed mutation does not replace the editor
contents.

The persistent widget is a compact framed three-line panel: its top border shows
**Prompt stash** plus `1 saved` or `N saved`, its body shows the latest stash
preview, and its bottom border closes the frame. It stays three lines regardless
of stash count and disappears when no stashes remain. While either stash or
history is open, the compact widget yields to the shared picker in the same
above-editor slot. Closing the picker restores the latest compact widget or
pending feedback state.

In TUI mode, routine `Stashed`, `Applied`, `Popped`, `Dropped`, `No stashes`,
and no-history feedback temporarily replaces the persistent widget for roughly
three seconds. New feedback replaces the previous state and timer; afterward
the latest-stash panel returns, or the widget disappears when no stashes remain.
Feedback produced while either picker is open starts its timer only after the
picker closes and the compact feedback surface becomes visible.
These routine states do not add entries to message history. Warnings and errors
still use Pi notifications.

## Searching prompt history

Run `/history` to open the shared full-width picker above the editor. `Ctrl+R`
opens the same picker in a non-Vim editor and in `pi-vim` insert or replace
mode. In Vim normal, visual, visual-line, and command-line modes, `Ctrl+R` is
delegated unchanged so normal-mode redo and other modal behavior remain
available.

The picker starts in text-filter mode and supports:

- configured Enter and cancel keys;
- `Ctrl+P` / `Ctrl+N`;
- configured up/down arrows;
- configured Page Up/Down.

In both stash and history, row and page movement wrap at both ends. The visible
result count follows the terminal height, remains at least one row, and is
capped at **10 rows**; page movement uses the currently visible row count.

Search is case-insensitive across prompt text and session name. Exact phrases
rank before substring matches, which rank before fuzzy matches; equally relevant
results are newest first. Exact query tokens are highlighted. The picker returns
at most **120 results**.

Rows include the session name (or `History`), timestamp, prompt preview, exact
working directory, and an image marker when the original user message contained
an image. Slash commands are included.

Current-session user prompts are merged live by session-path and entry identity.
Other session files are indexed lazily. While work is active, the picker
updates its query and displays either `Indexing sessions N/M…` or
`Indexing prompts N/M…`. An initially empty picker remains open while indexing
can still produce results; the terminal no-history state appears only after
indexing finishes without rows.

The current branch's user prompts are also preloaded into the editor's ordinary
up-arrow history when the editor instance is created.

## Storage and isolation

The fixed database path is:

```text
$XDG_STATE_HOME/pi/pi-history.sqlite
```

When `XDG_STATE_HOME` is unset, the fallback is:

```text
~/.local/state/pi/pi-history.sqlite
```

The database uses WAL mode, foreign keys, and a bounded busy timeout. Stashes
and history queries use exact `ctx.cwd` equality; there is no Git-root
normalization or cross-directory aggregation.

Session refreshes run at most once per directory every 30 seconds. Unchanged
session files are skipped by modification time, each changed file is replaced
in its own transaction, malformed sessions produce bounded warnings without
blocking other files, and shutdown waits for active refreshes before closing
SQLite.

There is no migration from earlier history extensions or other prompt-storage
databases. Existing files are left untouched; available Pi sessions are indexed
into this database as they are discovered.

## Non-TUI behavior

Print, JSON, and RPC runs still load the extension and may refresh the durable
index, but they do not install an editor input layer, widget, or picker.
Invoking `/history` outside TUI mode reports that the picker is unavailable and
does not modify editor content. Informational fallbacks in these non-TUI modes
continue to use Pi notifications.

## Shortcut conflicts

`Ctrl+S` and `Ctrl+R` are fixed direct editor interceptions rather than
configurable Pi actions. Terminal bindings or other extensions that claim the
same keys can conflict. Picker navigation honors Pi's configured select
bindings where documented above.
