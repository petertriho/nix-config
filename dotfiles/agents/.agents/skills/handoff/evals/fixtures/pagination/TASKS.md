# Tasks: cursor pagination for list_notes

Plan: replace offset paging with opaque cursors so that inserts during paging
do not skip or repeat notes.

- [x] T1 Add cursor encode and decode helpers in `notes_api/cursor.py`.
- [x] T2 Make `NoteStore.ordered()` stable: sort by `(created_at, id)`.
- [ ] T3 Add a `cursor` parameter to `list_notes`. Keep `offset` as a
      deprecated fallback for one release.
- [ ] T4 Add tests: cursor round trip, and no skipped or repeated notes when
      two notes share a `created_at`.
- [ ] T5 Update the API section of `README.md`.
