"""In-memory note store used by the API handlers and tests."""
from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class Note:
    id: int
    title: str
    created_at: datetime


@dataclass
class NoteStore:
    notes: list[Note] = field(default_factory=list)

    def add(self, note: Note) -> None:
        self.notes.append(note)

    def ordered(self) -> list[Note]:
        return sorted(self.notes, key=lambda n: n.created_at)
