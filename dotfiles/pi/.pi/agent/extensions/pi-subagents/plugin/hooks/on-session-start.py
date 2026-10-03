#!/usr/bin/env python3
"""Record the transcript boundary for one pi-spawned Claude launch."""

import hashlib
import json
import os
import sys


def main():
    sentinel = os.environ.get("PI_CLAUDE_SENTINEL")
    expected = os.environ.get("PI_CLAUDE_PROMPT_HASH")
    if not sentinel or not expected:
        return

    try:
        data = json.load(sys.stdin)
        # SessionStart also runs after /clear and compaction. Neither starts a
        # new pi launch. An in-process /resume must not reset the boundary either.
        if data.get("source") not in ("startup", "resume"):
            return
        with open(sentinel + ".launch", "x", encoding="utf-8") as marker:
            path = data["transcript_path"]
            if not isinstance(path, str) or not path:
                return
            try:
                with open(path, "rb") as transcript:
                    prefix = transcript.read()
            except FileNotFoundError:
                # A fresh session need not have written its transcript yet.
                prefix = b""
            json.dump({
                "transcript_path": path,
                "prompt_hash": expected,
                "offset": len(prefix),
                "prefix_hash": hashlib.sha256(prefix).hexdigest(),
            }, marker)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        # Exclusive creation keeps the first launch boundary immutable. A
        # missing/partial marker also makes Stop fail closed if capture fails.
        return


if __name__ == "__main__":
    main()
