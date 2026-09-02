# Workflow discovery registry

The registry discovers workflow packages from three non-recursive roots:

1. bundled `workflows/`
2. global `${getAgentDir()}/workflows/`
3. trusted project `${canonicalProjectRoot}/${CONFIG_DIR_NAME}/workflows/`

Version 1 behavior:

- later scopes override earlier scopes by workflow ID
- invalid packages emit path-specific diagnostics and are skipped
- only direct child package directories are considered
- alias collisions across final workflows disable the alias for all claimants
- collisions with existing extension, prompt, or skill commands disable only
  the alias; the workflow still remains runnable by ID
