"""List endpoint logic."""
from notes_api.store import Note, NoteStore


def list_notes(store: NoteStore, limit: int = 20, offset: int = 0) -> list[Note]:
    """Return one page of notes, oldest first."""
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")
    return store.ordered()[offset : offset + limit]
