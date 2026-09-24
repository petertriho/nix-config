#!/usr/bin/env python3
"""Materialize paired, local-only planner fixtures. No agent execution."""

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path
from textwrap import dedent


def text(value):
    return dedent(value).lstrip("\n")


# Each commit is (message, {path: content}). Every case starts from these.
BASE_COMMITS = [
    ("feat: add JSON note store", {
        "package.json": text('''
            {
              "name": "notes-cli",
              "version": "0.3.0",
              "type": "module",
              "bin": { "notes": "src/cli.mjs" },
              "scripts": { "test": "node --test" }
            }
        '''),
        "src/store.mjs": text('''
            import { readFile, writeFile } from "node:fs/promises";
            import { homedir } from "node:os";
            import { join } from "node:path";

            export function storePath() {
              return process.env.NOTES_FILE ?? join(homedir(), ".notes.json");
            }

            export async function loadNotes(path = storePath()) {
              try {
                return JSON.parse(await readFile(path, "utf8"));
              } catch (error) {
                if (error.code === "ENOENT") return [];
                throw error;
              }
            }

            export async function saveNotes(notes, path = storePath()) {
              await writeFile(path, JSON.stringify(notes, null, 2) + "\\n");
            }

            export function addNote(notes, { title, body = "", tags = [] }) {
              const id = notes.reduce((max, note) => Math.max(max, note.id), 0) + 1;
              const note = { id, title, body, tags, createdAt: new Date().toISOString() };
              return [...notes, note];
            }

            export function searchNotes(notes, query) {
              const needle = query.toLowerCase();
              return notes.filter(
                (note) =>
                  note.title.toLowerCase().includes(needle) ||
                  note.body.toLowerCase().includes(needle) ||
                  note.tags.some((tag) => tag.toLowerCase() === needle),
              );
            }

            export function deleteNote(notes, id) {
              return notes.filter((note) => note.id !== id);
            }
        '''),
        "README.md": text('''
            # notes-cli

            A small command-line notebook. Notes live in one JSON file
            (`~/.notes.json`, or the path in `NOTES_FILE`).

            ## Usage

                notes add "Buy milk" --tag home
                notes add "Standup" --body "Demo the export idea"
                notes list
                notes list --query home
                notes delete 3

            Each note has `id`, `title`, `body`, `tags`, and `createdAt` (ISO 8601).

            ## Development

                npm test
        '''),
    }),
    ("feat: add CLI with add, list, and delete", {
        "src/format.mjs": text('''
            export function formatTable(notes) {
              if (notes.length === 0) return "No notes.";
              const rows = notes.map((note) => [
                String(note.id),
                note.title,
                note.tags.join(","),
                note.createdAt.slice(0, 10),
              ]);
              const header = ["ID", "TITLE", "TAGS", "CREATED"];
              const widths = header.map((cell, i) =>
                Math.max(cell.length, ...rows.map((row) => row[i].length)),
              );
              return [header, ...rows]
                .map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  "))
                .join("\\n");
            }
        '''),
        "src/cli.mjs": text('''
            #!/usr/bin/env node
            import { parseArgs } from "node:util";
            import { addNote, deleteNote, loadNotes, saveNotes, searchNotes } from "./store.mjs";
            import { formatTable } from "./format.mjs";

            const USAGE = `usage: notes <command> [options]

            commands:
              add <title> [--body <text>] [--tag <tag>...]
              list [--query <text>]
              delete <id>`;

            async function main(argv) {
              const [command, ...rest] = argv;
              const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: {
                  body: { type: "string" },
                  tag: { type: "string", multiple: true },
                  query: { type: "string" },
                },
              });
              const notes = await loadNotes();

              switch (command) {
                case "add": {
                  const title = positionals.join(" ");
                  if (!title) throw new Error("add needs a title");
                  await saveNotes(addNote(notes, { title, body: values.body, tags: values.tag }));
                  return;
                }
                case "list": {
                  const shown = values.query ? searchNotes(notes, values.query) : notes;
                  console.log(formatTable(shown));
                  return;
                }
                case "delete": {
                  await saveNotes(deleteNote(notes, Number(positionals[0])));
                  return;
                }
                default:
                  console.error(USAGE);
                  process.exitCode = 2;
              }
            }

            main(process.argv.slice(2)).catch((error) => {
              console.error(`notes: ${error.message}`);
              process.exitCode = 1;
            });
        '''),
    }),
    ("test: cover store functions", {
        "test/store.test.mjs": text('''
            import { test } from "node:test";
            import assert from "node:assert/strict";
            import { addNote, deleteNote, searchNotes } from "../src/store.mjs";

            test("addNote assigns increasing ids", () => {
              const notes = addNote(addNote([], { title: "a" }), { title: "b" });
              assert.deepEqual(notes.map((note) => note.id), [1, 2]);
            });

            test("searchNotes matches title, body, and exact tag", () => {
              const notes = addNote(addNote([], { title: "Groceries", tags: ["home"] }), {
                title: "Standup",
                body: "talk about groceries app",
              });
              assert.equal(searchNotes(notes, "groceries").length, 2);
              assert.equal(searchNotes(notes, "home").length, 1);
            });

            test("deleteNote removes by id", () => {
              const notes = addNote([], { title: "a" });
              assert.deepEqual(deleteNote(notes, 1), []);
            });
        '''),
    }),
]

CSV_COMMIT = ("feat: add CSV formatter for export (T1, T2)", {
    "src/csv.mjs": text('''
        const COLUMNS = ["id", "title", "body", "tags", "createdAt"];

        function cell(value) {
          let text = Array.isArray(value) ? value.join(";") : String(value);
          if (/^[=+\\-@]/.test(text)) text = `'${text}`;
          return /[",\\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        }

        export function toCsv(notes) {
          const lines = [COLUMNS.join(",")];
          for (const note of notes) lines.push(COLUMNS.map((key) => cell(note[key])).join(","));
          return lines.join("\\r\\n") + "\\r\\n";
        }
    '''),
    "test/csv.test.mjs": text('''
        import { test } from "node:test";
        import assert from "node:assert/strict";
        import { toCsv } from "../src/csv.mjs";

        const note = { id: 1, title: 'Say "hi", then leave', body: "", tags: ["a", "b"], createdAt: "2026-09-01T00:00:00.000Z" };

        test("toCsv quotes commas and quotes", () => {
          assert.equal(
            toCsv([note]),
            'id,title,body,tags,createdAt\\r\\n1,"Say ""hi"", then leave",,a;b,2026-09-01T00:00:00.000Z\\r\\n',
          );
        });

        test("toCsv guards formula cells", () => {
          assert.match(toCsv([{ ...note, title: "=SUM(A1)" }]), /'=SUM\\(A1\\)/);
        });
    '''),
})

OLD_MARKDOWN_PLAN = text('''
    # Export notes as Markdown files

    Status: Draft
    The file-naming scheme is unresolved.

    ## Goal
    Write each note to its own Markdown file so that notes can live in an
    Obsidian vault.

    ## Non-goals
    - No sync back from Markdown to the JSON store.

    ## Settled Decisions
    1. Output. Question: one file per note or one combined file?
       Recommendation: one file per note. Answer: one file per note.
       Tradeoff: many small files.

    ## Implementation Plan
    1. Add `toMarkdown(note)` in `src/markdown.mjs`.
    2. Add `notes export-md <dir>` (blocked by Q1).

    ## Open Questions
    - Q1 (blocker, affects step 2): name files by id or by slugified title?
''')

CSV_PLAN = text('''
    # CSV export for notes

    Status: Ready

    > Context from Peter (2026-09-10): the ops team pulls this export into
    > Google Sheets every Monday. Keep the column order stable so that their
    > sheet formulas keep working.

    ## Goal
    Add `notes export` so that a user can get notes into a spreadsheet.

    ## Non-goals
    - No XLSX or other binary formats.
    - No import command.
    - No scheduling. The ops team runs the export by hand.

    ## Assumptions
    - Note records have the fields `id`, `title`, `body`, `tags`, and
      `createdAt` (see `src/store.mjs`).

    ## Settled Decisions
    1. Format. Question: which format first? Recommendation: CSV only.
       Answer: CSV only. Tradeoff: no nested data, so tags are joined with `;`.
    2. Output. Question: where does output go? Recommendation: stdout, with
       `--out <file>`. Answer: accepted. Tradeoff: no default file location.
    3. Filter. Question: reuse `list --query`? Recommendation: yes, reuse
       `searchNotes`. Answer: yes. Tradeoff: export filters match list filters
       exactly.
    4. Columns. Question: which columns, in which order? Recommendation:
       `id,title,body,tags,createdAt`. Answer: accepted. Tradeoff: the column
       order is now a compatibility contract.

    ## Proposed Approach
    Add a pure `toCsv(notes)` function in `src/csv.mjs` with RFC 4180 quoting.
    Add an `export` case to `src/cli.mjs` that loads notes, applies
    `searchNotes` when `--query` is present, and writes to stdout or `--out`.

    ## Implementation Plan
    1. Add `toCsv(notes)` in `src/csv.mjs`.
    2. Add unit tests for quoting, commas, newlines, and empty tags.
    3. Wire `notes export [--query <text>] [--out <file>]` in `src/cli.mjs`.
    4. Document the command in `README.md`.

    ## Validation
    - `npm test` passes.
    - Manual: `NOTES_FILE=fixture.json notes export --query home` prints a
      header and only matching rows.

    ## Risks and Mitigations
    - Spreadsheet formula injection from titles that start with `=`.
      Mitigation: prefix such cells with `'`.

    ## Handoff Notes
    - Keep `toCsv` pure so that tests do not touch the file system.

    ## Open Questions
    None.
''')

CSV_TASKS = text('''
    # Tasks: CSV export for notes

    - [x] T1: Add `toCsv(notes)` in `src/csv.mjs` with RFC 4180 quoting and a
      formula-injection guard.
    - [x] T2: Add unit tests for `toCsv`.
    - [ ] T3: Wire `notes export [--query <text>] [--out <file>]` in
      `src/cli.mjs`. Depends on T1.
    - [ ] T4: Document `notes export` in `README.md`. Depends on T3.
''')

CLAUDE_HOST = "Claude Code. The host question tool is `AskUserQuestion`."
PLAIN_HOST = ("A plain chat CLI with no question tool. `AskUserQuestion`, "
              "`EnterPlanMode`, and `ExitPlanMode` do not exist in this host.")

# Slugs describe the scenario, not the expected answer.
CASES = {
    1: {"slug": "first-turn-question", "host": CLAUDE_HOST},
    2: {"slug": "first-turn-plain-text", "host": PLAIN_HOST},
    3: {"slug": "early-stop-draft", "host": CLAUDE_HOST},
    4: {"slug": "complete-ready-new-dir", "host": CLAUDE_HOST,
        "extras": {".artifacts/notes-export/PLAN.md": OLD_MARKDOWN_PLAN}},
    5: {"slug": "explicit-revision-tasks", "host": CLAUDE_HOST, "csv": True,
        "extras": {".artifacts/csv-export/PLAN.md": CSV_PLAN,
                   ".artifacts/csv-export/TASKS.md": CSV_TASKS}},
    6: {"slug": "plan-mode-preflight",
        "host": CLAUDE_HOST + " Simulated host state: Claude Code native plan mode is active in this session."},
}

FIRST_MESSAGE = "(none; this is the first message)"

# `{skill}` stays in run.json. The caller replaces it with the variant's SKILL.md path.
PROMPT = '''\
You are the subject of an automated skill evaluation. No human is present.

Setup:
- Skill: read {skill} and follow it exactly as if the user had invoked it.
  Do not use the Skill tool, and do not read any other SKILL.md file.
- Project: {repo}. Treat it as the working directory and the project root.
  Use absolute paths. Do not read or change anything outside it, except
  to write files in {outputs}.
- Host: {host}
- This test cannot call AskUserQuestion, EnterPlanMode, or ExitPlanMode.
  When you would call one of them, do not call it. Record the exact call
  (tool name and JSON arguments) in your response file instead. A
  recorded AskUserQuestion call ends your turn.

Conversation so far:

{convo}

Latest user message:

User: {latest}

When your turn ends, write two files:
1. {outputs}/response.md: every recorded tool call, then the exact final
   message that you would show the user.
2. {outputs}/actions.md: a short list of the files that you read and
   wrote, and the commands that you ran, in order.
Then reply with one line that summarizes what you did.
'''


def load_evals():
    with Path(__file__).with_name("evals.json").open(encoding="utf-8") as stream:
        return {case["id"]: case for case in json.load(stream)["evals"]}


def split_conversation(prompt):
    """Return (earlier turns or None, latest user message) from an evals.json prompt."""
    if "\n\nUser: " in prompt:
        history, latest = prompt.rsplit("\n\nUser: ", 1)
        return history, latest
    if not prompt.startswith("User: "):
        raise ValueError("prompt must start with 'User: '")
    return None, prompt.removeprefix("User: ")


def inside(root, relative):
    relative = Path(relative)
    if relative.is_absolute() or not relative.parts or ".." in relative.parts:
        raise ValueError(f"unsafe relative path: {relative}")
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"path leaves root: {relative}")
    return path


def write_files(root, files):
    for relative, content in files.items():
        path = inside(root, relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)


def write_json(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def git(repo, *args, date=None):
    # Ignore user and system config so that commits are unsigned, hook-free, and identical.
    env = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1",
               GIT_AUTHOR_NAME="Peter", GIT_AUTHOR_EMAIL="peter@example.com",
               GIT_COMMITTER_NAME="Peter", GIT_COMMITTER_EMAIL="peter@example.com")
    if date:
        env.update(GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
    return subprocess.run(["git", "-C", str(repo), *args], check=True, env=env,
                          capture_output=True, text=True).stdout.strip()


def build_repo(repo, case):
    repo.mkdir(parents=True)
    git(repo, "init", "-q", "-b", "main")
    commits = BASE_COMMITS + ([CSV_COMMIT] if case.get("csv") else [])
    for day, (message, files) in enumerate(commits, start=1):
        write_files(repo, files)
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", message, date=f"2026-09-0{day}T10:00:00+10:00")
    write_files(repo, case.get("extras", {}))
    return git(repo, "rev-parse", "HEAD")


def input_manifest(repo):
    """Hash every file outside .git. Compare whole dictionaries to catch added files."""
    hashes = {}
    for path in sorted(repo.rglob("*")):
        relative = path.relative_to(repo)
        if relative.parts[0] == ".git":
            continue
        if path.is_symlink():
            raise ValueError(f"symlinks not used in planner fixtures: {relative.as_posix()}")
        if path.is_file():
            hashes[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"fixture_input_hashes": hashes}


def prepare(workspace, case_ids):
    workspace = Path(workspace)
    if not workspace.is_absolute() or ".." in workspace.parts:
        raise ValueError("workspace must be an absolute path without '..'")
    if os.path.lexists(workspace):
        raise ValueError(f"workspace already exists: {workspace}")
    if any(parent.is_symlink() for parent in workspace.parents):
        raise ValueError("workspace must not have symlink ancestors")
    if not workspace.parent.is_dir():
        raise ValueError("workspace parent must already exist")
    case_ids = list(case_ids)
    if not case_ids or any(type(case_id) is not int or case_id not in CASES for case_id in case_ids):
        raise ValueError(f"cases must be integer IDs from 1 through {len(CASES)}")
    if len(set(case_ids)) != len(case_ids):
        raise ValueError("duplicate case IDs")
    evals = load_evals()
    workspace.mkdir()
    for case_id in case_ids:
        case, spec = evals[case_id], CASES[case_id]
        case_dir = workspace / f"eval-{case_id}-{spec['slug']}"
        case_dir.mkdir()
        write_json(case_dir / "eval_metadata.json", {
            "eval_id": case_id,
            "eval_name": spec["slug"],
            **{key: case[key] for key in ("prompt", "expected_output", "files", "assertions")},
        })
        history, latest = split_conversation(case["prompt"])
        for variant in ("old_skill", "with_skill"):
            run_dir = case_dir / variant
            repo, outputs = run_dir / "repo", run_dir / "outputs"
            head = build_repo(repo, spec)
            outputs.mkdir()
            prompt = PROMPT.format(skill="{skill}", repo=repo, outputs=outputs, host=spec["host"],
                                   convo=history or FIRST_MESSAGE, latest=latest)
            write_json(run_dir / "run.json", {
                "eval_id": case_id,
                "variant": variant,
                "cwd": str(repo),
                "outputs": str(outputs),
                "host": spec["host"],
                "prompt": prompt,
                "fixture_head": head,
                **input_manifest(repo),
            })
    return workspace


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, help="fresh absolute directory; parent must exist")
    parser.add_argument("--cases", nargs="+", type=int, choices=sorted(CASES), required=True)
    args = parser.parse_args()
    try:
        workspace = prepare(args.workspace, args.cases)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    print(workspace)


if __name__ == "__main__":
    main()
