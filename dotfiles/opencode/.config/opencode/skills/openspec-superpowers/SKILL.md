---
name: openspec-superpowers
description: Use when working an OpenSpec change lifecycle and you need superpowers process rigor without replacing OpenSpec commands, artifacts, or change state.
---

# OpenSpec Superpowers

## Overview

Route work to OpenSpec first, then layer the right superpowers skill at each stage.

Core principle: OpenSpec is the source of truth; superpowers is the quality and process layer.

## When to Use

- User mentions OpenSpec actions: propose, explore, apply, verify, sync, archive
- User asks to "use superpowers" while working `openspec/changes/*`
- User needs stronger process discipline (TDD/debug/verification/review) during OpenSpec execution

Do not use this skill when work is not OpenSpec-driven.

## Router Flow

1. **Preflight**
   - Check OpenSpec workspace (`openspec/` exists, change context resolvable).
   - If missing, initialize with OpenSpec commands instead of inventing parallel docs.

2. **Route by intent**
   - **Explore / shape request**: Use `superpowers:brainstorming`, then run `/opsx:explore` or `/opsx:propose`.
   - **Implement active change**: Use `superpowers:test-driven-development`, then run `/opsx:apply`.
   - **If blocked by failures**: Use `superpowers:systematic-debugging` before proposing fixes.
   - **Pre-finish quality gate**: Use `superpowers:verification-before-completion`; optionally `superpowers:requesting-code-review`.
   - **Close out change**: Use `superpowers:finishing-a-development-branch`, then `/opsx:archive`.

3. **Keep state in OpenSpec**
   - Use OpenSpec status/instructions/tasks as execution truth.
   - Update OpenSpec artifacts; do not create a second planning system.

## Quick Reference

| User intent                     | Superpowers hook                                                     | OpenSpec action                                   |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| "Help me plan this change"      | `brainstorming`                                                      | `/opsx:explore` or `/opsx:propose`                |
| "Implement this change"         | `test-driven-development`                                            | `/opsx:apply`                                     |
| "Tests fail / bug during apply" | `systematic-debugging`                                               | continue `/opsx:apply` after diagnosis            |
| "Ready to finish"               | `verification-before-completion` + optional `requesting-code-review` | `/opsx:verify` (if enabled), then `/opsx:archive` |
| "Ship/merge branch work"        | `finishing-a-development-branch`                                     | archive and finalize                              |

## Guardrails

- Never replace OpenSpec artifacts (`proposal.md`, `design.md`, `tasks.md`) with external plan files.
- Never archive before verification gate unless user explicitly accepts risk.
- Never bypass process skill hooks for the matching stage.
- Never invent non-OpenSpec status tracking for OpenSpec change progress.

## Common Mistakes

- Running superpowers implementation flow without checking OpenSpec change context first.
- Treating OpenSpec and superpowers as competing planners instead of router + discipline layers.
- Skipping TDD/debug/verification hooks because `/opsx:apply` already exists.

## Rationalizations and Counters

| Excuse                                            | Reality                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| "OpenSpec already has apply, no need superpowers" | OpenSpec defines workflow state; superpowers enforces execution rigor.     |
| "I'll track tasks in a separate plan doc"         | That creates split truth; OpenSpec tasks remain canonical for the change.  |
| "I can archive now and verify later"              | Verification must precede archive to avoid locking in unverified behavior. |

## Red Flags

- Creating a second plan/checklist outside `openspec/changes/*`
- Applying fixes without TDD or debugging discipline during `/opsx:apply`
- Archiving a change without an explicit verification step

If any red flag appears, stop and re-route through this skill.
