"""Merge Nix-declared Codex settings into a mutable TOML file.

Usage: codex-merge-config.py EXISTING OVERLAY

Tables merge recursively. Overlay scalars and arrays replace existing values.
Keys and comments that the overlay does not declare remain unchanged.

Exit status:
    0  merged TOML written to stdout
    3  EXISTING is not valid TOML; the caller backs it up and starts fresh
    1  any other failure (bad usage, unreadable input, invalid OVERLAY)
"""

import sys
from pathlib import Path

import tomlkit
from tomlkit.exceptions import TOMLKitError
from tomlkit.items import InlineTable, Table

MERGEABLE = (Table, InlineTable)

EXIT_INVALID_EXISTING = 3


def deep_merge(base, overlay):
    for key, value in overlay.items():
        current = base.get(key)
        if isinstance(current, MERGEABLE) and isinstance(value, MERGEABLE):
            deep_merge(current, value)
        else:
            base[key] = value


def main(argv):
    if len(argv) != 3:
        print(f"usage: {Path(argv[0]).name} EXISTING OVERLAY", file=sys.stderr)
        return 1

    existing_path = Path(argv[1])
    try:
        existing = existing_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        existing = ""
    except (OSError, UnicodeDecodeError) as error:
        print(f"codex-merge-config: cannot read {existing_path}: {error}", file=sys.stderr)
        return 1

    overlay_path = Path(argv[2])
    try:
        overlay = overlay_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        print(f"codex-merge-config: cannot read {overlay_path}: {error}", file=sys.stderr)
        return 1

    try:
        document = tomlkit.parse(existing)
    except TOMLKitError as error:
        print(f"codex-merge-config: {existing_path} is not valid TOML: {error}", file=sys.stderr)
        return EXIT_INVALID_EXISTING

    try:
        deep_merge(document, tomlkit.parse(overlay))
    except TOMLKitError as error:
        print(f"codex-merge-config: {overlay_path} is not valid TOML: {error}", file=sys.stderr)
        return 1

    sys.stdout.write(tomlkit.dumps(document))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
