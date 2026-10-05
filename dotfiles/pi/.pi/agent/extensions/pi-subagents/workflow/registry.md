# Workflow discovery registry

The registry discovers workflow packages from three non-recursive roots:

1. Bundled: `pi-subagents/workflows/` under the extensions directory.
2. Global: `${getAgentDir()}/workflows/`.
3. Trusted project: `${canonicalProjectRoot}/${CONFIG_DIR_NAME}/workflows/`.

The internal coordinator loads these packages through the single `pi-subagents` extension.

Version 1 behavior:

- Later scopes override earlier scopes by workflow ID.
- Invalid packages produce path-specific diagnostics. The registry skips these packages.
- The registry examines only direct child package directories.
- Alias collisions across final workflows disable the alias for all claimants.
- Collisions with existing extension, prompt, or skill commands disable only
  the alias. The workflow remains runnable by ID.
