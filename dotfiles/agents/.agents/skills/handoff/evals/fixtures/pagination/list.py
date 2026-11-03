"""List endpoint logic."""
from notes_api.cursor import decode_cursor
from notes_api.store import Note, NoteStore


def list_notes(
    store: NoteStore, limit: int = 20, offset: int = 0, cursor: str | None = None
) -> list[Note]:
    """Return one page of notes, oldest first."""
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")
    notes = store.ordered()
    if cursor is not None:
        after = decode_cursor(cursor)
        return [n for n in notes if (n.created_at, n.id) > after][:limit]
    # TODO: return next_cursor with the page once the response shape is agreed.
    return notes[offset : offset + limit]
