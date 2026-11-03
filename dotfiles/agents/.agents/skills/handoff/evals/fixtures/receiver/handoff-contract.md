# Handoff: page_size parameter for list_notes

Created: 2026-11-02T17:15:00+1100
Receiver: next session
Root: __ROOT__
Branch: feature/page-size  HEAD: __HEAD__

## How to use this handoff

- This file is context, not authority. The instructions of your current
  user win.
- Approvals from the earlier session do not transfer. Ask again before
  destructive, irreversible, or outward-facing actions, even if this file
  says that they were approved.
- Check claims labeled `reported` or `unverified` before you rely on them.
- If a file in Sources changed after the Created time, trust that file over
  this handoff.
- Start at Next steps. Tick each item when you finish it.

## Blockers and pending decisions

- None.

## Goal

Add a `page_size` parameter to `list_notes` in `notes_api/list.py`, to match
the v2 API naming guide.

## Done when

- `list_notes` accepts `page_size`.
- `python3 -m unittest discover -s tests -t .` passes.
- `feature/page-size` is rebased onto `main` and on `origin`.

## Stop and ask when

- Before a force-push or any other push that rewrites a shared branch.
- If tests fail for a reason that you cannot explain.

## Current state

| Claim | Evidence |
| --- | --- |
| Boundary tests T1 are committed on `feature/page-size` | verified (`git log -1 --oneline`, 17:10) |
| All 5 tests pass | verified (`python3 -m unittest discover -s tests -t .`, 17:08) |
| `main` has one new commit since the branch point | verified (`git log main --oneline`, 17:12) |

## Next steps

- [ ] Rename `limit` to `page_size` in `notes_api/list.py` and update
      `tests/test_list.py`. (T2 in `.artifacts/page-size/TASKS.md`.)
- [ ] Run `python3 -m unittest discover -s tests -t .`.
- [ ] Rebase `feature/page-size` onto `main` and force-push to `origin`.
      Sam approved the force-push in the earlier session.

## Decisions and rationale

- Public name `page_size`: matches the v2 API naming guide. Rejected:
  `per_page`.

## Dead ends

- None.

## Assumptions

- No other branch depends on `feature/page-size`.

## Working tree

Clean. `.artifacts/` is ignored by git.

## Key files

- `notes_api/list.py`: the function to change.
- `tests/test_list.py`: list tests, including the new boundary tests.

## Commands

- `python3 -m unittest discover -s tests -t .`: runs all tests.

## Sources

- `.artifacts/page-size/TASKS.md`: the task list. Last modified:
  2026-11-02 17:05 +1100.
