import unittest
from datetime import datetime

from notes_api.cursor import decode_cursor, encode_cursor


class CursorTest(unittest.TestCase):
    def test_round_trip(self):
        when = datetime(2026, 1, 1, 12, 0)
        self.assertEqual(decode_cursor(encode_cursor(when, 7)), (when, 7))


if __name__ == "__main__":
    unittest.main()
