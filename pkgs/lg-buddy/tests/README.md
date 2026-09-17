# LG Buddy regression tests

The tests use Python's standard library. Python is not a package runtime dependency.

From the repository root:

1. Build the package.

   ```sh
   out="$(nix build --no-link --print-out-paths .#lg-buddy)"
   ```

2. Run the forwarder tests.

   ```sh
   python3 pkgs/lg-buddy/tests/test_configure.py "$out"
   ```

3. Run the module tests.

   ```sh
   python3 pkgs/lg-buddy/tests/test_module.py
   ```

The package build also runs an installed-forwarder help check with an empty tools PATH.
The forwarder tests use a fake runtime, except for real headless help.
The module tests evaluate AMD-PC's scripts with fake TV, `ping`, and `ip` commands.
They do not change live configuration or start services.

## Optional upstream integration tests

Do not run these during real setup. Upstream acquires the current user's onboarding lock.

```sh
python3 pkgs/lg-buddy/tests/test_configure.py "$out" --integration
```

These tests need a non-root NixOS session with a writable `/run/user/UID`.
They use temporary profiles and synthetic tokens, never approve pairing, and cancel at the first interactive prompt.
They skip if an upstream installation pointer could select a live configuration.
Passing these tests does not verify live TV access, service activation, or sleep/resume behavior.
