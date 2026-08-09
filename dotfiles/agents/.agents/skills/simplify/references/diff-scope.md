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

Explicit paths limit the result. Otherwise `--staged` takes precedence over `--ref`;
the default is current uncommitted work.

## Map Entries to Editable Scope

- `M` with `type: regular`: edit only the original `ranges`.
- `A` or `?` with `type: regular`: the whole current file is editable.
- `R` or `C` with `type: regular`: edit only destination `ranges`; a pure rename has
  no editable code.
- `D`, `symlink`, and `submodule`: do not edit.
- `T`, `U`, `X`, `B`, or an unfamiliar status: stop for that path.
- `requested_without_diff`: no changed code is editable.

In staged mode, stop for a tracked entry when `unstaged_patch` is nonempty. Do not try
to infer safe overlap or shifted coordinates. Keep all simplification edits unstaged.
Use `blob_oid` only when full staged regular-file context is required:

```bash
git -C "$repository_root" cat-file blob "$blob_oid"
```

## Audit

Re-run the exact resolver command after editing. Confirm every edit descends from an
original `ranges` region or whole-file `A`/`?` entry and confirm the index is
unchanged. Apply the validation and rollback rules from `SKILL.md` when the audit
fails.

Do not duplicate resolver field inventories here. When the command changes a field
used above, update its tests, bump `schema_version` for a breaking change, then update
this adapter.
