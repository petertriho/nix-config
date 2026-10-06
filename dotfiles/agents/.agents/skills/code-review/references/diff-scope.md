# Diff Scope

This file is the adapter between `git-diff-scope` and code-review. The command and
its tests own Git mechanics and the JSON contract. Keep general review policy in
`SKILL.md` and finding policy in `review-checklists.md`.

## Resolve

Require `git-diff-scope` for Git-backed review. If it is unavailable or returns an
error, report “Nothing Reviewed” and stop without selecting another scope.

Use the invocation matching the request:

```bash
git-diff-scope --pretty
git-diff-scope --staged --pretty
git-diff-scope --ref "$ref" --pretty
git-diff-scope --ref "$ref" --include-untracked --pretty
git-diff-scope --staged --pretty -- "$path1" "$path2"
```

The default is current uncommitted work. Explicit paths after `--` limit any mode.
`--staged` and `--ref` cannot be combined. If a request names both, use `--staged`
and say that the ref was not applied. Add `--include-untracked` when a ref review
must include repository-wide untracked additions, such as an unstaged implementation
review. Run from the user's current directory.

## Interpret

- If the output is too large to read at once, first list `repository_root`, `scope`,
  `requested_without_diff`, and each entry's `status`, `type`, and `path`. Then read
  the patches one entry at a time, for example with `jq -r '.entries[N].patch'`. A
  truncated preview is not the full scope.
- Review `entries[].patch`; use `entries[].path` as the current path and `old_path`
  for rename or copy context. Both paths are relative to `repository_root`, not to
  the current directory.
- Treat status `?` as a whole-file untracked addition. It appears in default mode,
  when `--include-untracked` is set, or when an untracked path is explicitly named.
- A ref comparison contains all tracked worktree changes against the ref.
  `--include-untracked` also includes all current untracked files. The result cannot
  distinguish implementation changes from worktree changes that already existed.
- In staged mode, treat `patch`, `mode`, and `blob_oid` as the source of truth. A
  nonempty `unstaged_patch` is context only, never staged code.
- Read full staged regular-file content only when needed:

  ```bash
  git -C "$repository_root" cat-file blob "$blob_oid"
  ```

- For `requested_without_diff`, perform a whole-file review only when the user asked
  for one. Do not broaden a changed-lines request.
- For a named directory, `entries` lists only its changed files. When any file in
  it changed, the directory is absent from `requested_without_diff`.
- Apply `type` before reading content: review `regular`; inspect `symlink` or
  `submodule` as metadata without following or traversing it. Do not traverse an
  entry of type `directory`, such as an untracked nested repository, or read an
  `other` entry. List both as skipped.
- Review `D` from its patch. Stop for `T`, `U`, `X`, `B`, or an unfamiliar status.
- Empty `entries` means nothing changed unless an explicitly named whole-file item is
  listed in `requested_without_diff`.

Do not duplicate resolver field inventories here. When the command changes a field
used above, update its tests, bump `schema_version` for a breaking change, then update
this adapter.
