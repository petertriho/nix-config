"""Opaque cursors for list pagination."""
import base64
from datetime import datetime


def encode_cursor(created_at: datetime, note_id: int) -> str:
    raw = f"{created_at.isoformat()}|{note_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, int]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    created_at, note_id = raw.split("|")
    return datetime.fromisoformat(created_at), int(note_id)
