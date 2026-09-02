# Workflow package authoring contract

Bundled, global, and trusted project workflows all use the same package shape:

```text
<workflow-package>/
├── workflow.json
└── SKILL.md
```

Authoring notes for schema version 1:

- `workflow.json` must declare `version`, `id`, `command`, `skill`, `data`,
  and `roles`.
- `skill` must stay inside the package directory and point at a markdown file.
- `data` supports:
  - `kind: "file"` with an optional repository-relative constraint:
    - `under`: required subtree path inside the repository;
    - `basename`: optional exact file name.
  - `kind: "string"` for refs, labels, or other scalar handoff values.
- Role `reads` reference declared data slots.
- Role `writes` may include:
  - `worktree`
  - `file:<data-id>` for declared file slots only.

Private `SKILL.md` files are validated like skills, but they are not normal
discoverable Pi skills. Keep a small frontmatter block at the top:

```md
---
name: my-workflow
description: Orchestrate the workflow runtime for this package.
---

# Workflow

...
```

The bundled `pter/` package is the production example. Its `/pter` command is
generated from `workflow.json`; `/workflow run pter <request>` enters the same
startup path. Workflow skills must use `workflow_spawn`, `workflow_resume`,
`workflow_recover`, and `workflow_complete` for manifest roles rather than
ordinary subagent lifecycle tools.
