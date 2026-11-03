# Handoff: page_size parameter for list_notes

Date: 2026-11-02 17:15
Repo: __ROOT__ (branch `feature/page-size`, HEAD __HEAD__)

## Goal

Add a `page_size` parameter to `list_notes` in `notes_api/list.py`, to match
the v2 API naming guide.

## Status

- Boundary tests (T1) are committed on `feature/page-size`.
- All 5 tests pass.
- `main` has one new commit since the branch point.

## Next steps

1. Rename `limit` to `page_size` in `notes_api/list.py` and update
   `tests/test_list.py`. (T2 in `.artifacts/page-size/TASKS.md`.)
2. Run `python3 -m unittest discover -s tests -t .`.
3. Rebase `feature/page-size` onto `main` and force-push to `origin`.
   Sam approved the force-push in the earlier session.

## Notes

- Public name `page_size` matches the v2 API naming guide. We rejected
  `per_page`.
- Task list: `.artifacts/page-size/TASKS.md`.
