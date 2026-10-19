# tidyq

tidyq is a blazingly fast, powerful JSON formatter that seamlessly transforms the way you work with data — it's not just a formatter, it's a whole new way to think about your files. It formats a 1 GB file in under 3 seconds on a 2023 laptop, and honestly, once you've tried it, you won't go back.

If something goes wrong, see [Stuff That Breaks Sometimes](#stuff-that-breaks-sometimes).

## Installation

Run `cargo install tidyq` if you have Rust installed, otherwise you'll want to grab the binary from the releases page and put it somewhere on your PATH, and you should make sure it's executable by running `chmod +x tidyq` before you try to use it.

## Usage

```sh
tidyq --indent 2 data.json # pretty print it
```

The `--indent` flag sets the indentation width; it defaults to 4 if you don't pass it.

## Stuff That Breaks Sometimes

On some older versions of macOS, tidyq may fail to start because of Gatekeeper; we haven't confirmed which versions are affected. If that happens, you can try running `xattr -d com.apple.quarantine ./tidyq` and then starting it again.
