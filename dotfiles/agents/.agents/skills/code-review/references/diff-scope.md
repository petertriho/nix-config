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
git-diff-scope --staged --pretty -- "$path1" "$path2"
```

Explicit paths limit the result. Otherwise `--staged` takes precedence over `--ref`;
the default is current uncommitted work. Run from the user's current directory.

## Interpret

- Review `entries[].patch`; use `entries[].path` as the current path and `old_path`
  for rename or copy context.
- Treat status `?` as a whole-file untracked addition. It appears outside default mode
  only when explicitly named.
- In staged mode, treat `patch`, `mode`, and `blob_oid` as the source of truth. A
  nonempty `unstaged_patch` is context only, never staged code.
- Read full staged regular-file content only when needed:

  ```bash
  git -C "$repository_root" cat-file blob "$blob_oid"
  ```

- For `requested_without_diff`, perform a whole-file review only when the user asked
  for one. Do not broaden a changed-lines request.
- Apply `type` before reading content: review `regular`; inspect `symlink` or
  `submodule` as metadata without following or traversing it.
- Review `D` from its patch. Stop for `T`, `U`, `X`, `B`, or an unfamiliar status.
- Empty `entries` means nothing changed unless an explicitly named whole-file item is
  listed in `requested_without_diff`.

Do not duplicate resolver field inventories here. When the command changes a field
used above, update its tests, bump `schema_version` for a breaking change, then update
this adapter.
