import unittest
from datetime import datetime

from notes_api.list import list_notes
from notes_api.store import Note, NoteStore


def make_store(n: int) -> NoteStore:
    store = NoteStore()
    for i in range(n):
        store.add(Note(i, f"note {i}", datetime(2026, 1, 1, 12, i)))
    return store


class ListNotesTest(unittest.TestCase):
    def test_first_page(self):
        self.assertEqual([n.id for n in list_notes(make_store(5), limit=2)], [0, 1])

    def test_offset(self):
        self.assertEqual([n.id for n in list_notes(make_store(5), limit=2, offset=2)], [2, 3])

    def test_limit_bounds(self):
        with self.assertRaises(ValueError):
            list_notes(make_store(1), limit=0)

    def test_last_partial_page(self):
        self.assertEqual([n.id for n in list_notes(make_store(5), limit=2, offset=4)], [4])

    def test_offset_past_end(self):
        self.assertEqual(list_notes(make_store(3), limit=2, offset=10), [])


if __name__ == "__main__":
    unittest.main()
