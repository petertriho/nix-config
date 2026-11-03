# Tasks: page_size parameter for list_notes

Updated: 2026-11-03 09:30 +1100 (Sam)

- [x] T1 Add boundary tests for `list_notes` (last partial page, offset past
      the end).
- [ ] T2 Keep `limit` and add `page_size` as an alias. If both are given,
      `page_size` wins. Do not remove `limit`: the mobile clients still send
      it. (Changed 2026-11-03. Was: rename `limit` to `page_size`.)
- [ ] T3 Run `python3 -m unittest discover -s tests -t .`.
- [ ] T4 Rebase `feature/page-size` onto `main` and push.
