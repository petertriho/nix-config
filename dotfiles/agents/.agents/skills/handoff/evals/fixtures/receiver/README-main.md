# notes-api

A small notes service. The API layer lives in `notes_api/`.

Run the tests:

    python3 -m unittest discover -s tests -t .

## List API

`list_notes(store, limit=20, offset=0)` returns one page of notes, oldest
first. `limit` must be between 1 and 100.
