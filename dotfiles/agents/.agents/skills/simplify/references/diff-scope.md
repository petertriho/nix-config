# Diff Scope

This file is the adapter between `git-diff-scope` and simplify. The command and its
tests own Git mechanics and the JSON contract. Keep behavior, validation, rollback,
and reporting rules in `SKILL.md`.

## Resolve and Retain

Require `git-diff-scope`. Stop before editing if it is unavailable, the repository or
ref is invalid, or another resolver error occurs.

Run the matching command before any edit and retain its output:

```bash
git-diff-scope --patch-context 0 --pretty
git-diff-scope --staged --patch-context 0 --pretty
git-diff-scope --ref "$ref" --patch-context 0 --pretty
git-diff-scope --staged --patch-context 0 --pretty -- "$path1" "$path2"
```

The default is current uncommitted work. Explicit paths after `--` limit any mode.
`--staged` and `--ref` cannot be combined. If a request names both, use `--staged`
and say that the ref was not applied. Run from the user's current directory.
`entries[].path` and `old_path` are relative to `repository_root`, not to the
current directory.

## Map Entries to Editable Scope

For every scope:

- `D`, `symlink`, `submodule`, `directory`, and `other`: do not edit.
- `T`, `U`, `X`, `B`, or an unfamiliar status: stop for that path.

For a diff-limited scope:

- `M` with `type: regular`: edit only the original `ranges`.
- `A` or `?` with `type: regular`: the whole current file is editable.
- `R` or `C` with `type: regular`: edit only destination `ranges`; a pure rename has
  no editable code.
- `requested_without_diff`: no code is editable.

For a whole-file scope, every regular file in a named path is editable, including
unchanged files. The resolver lists only changed files. When any file in a named
directory changed, the directory is absent from `requested_without_diff`. List a
named directory's files with `git ls-files -- "$path"` and
`git ls-files --others --exclude-standard -- "$path"`. A named path with
`exists: false` in `requested_without_diff` is a stop condition.

In staged mode, stop for a tracked entry when `unstaged_patch` is nonempty. Do not try
to infer safe overlap or shifted coordinates. Keep all simplification edits unstaged.
Use `blob_oid` only when full staged regular-file context is required:

```bash
git -C "$repository_root" cat-file blob "$blob_oid"
```

## Audit

Re-run the exact resolver command after editing. Confirm every edit descends from an
original `ranges` region, a whole-file `A`/`?` entry, or a regular file in a
whole-file named path. Confirm the index is unchanged. Apply the validation and
rollback rules from `SKILL.md` when the audit fails.

Do not duplicate resolver field inventories here. When the command changes a field
used above, update its tests, bump `schema_version` for a breaking change, then update
this adapter.
