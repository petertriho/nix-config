---
name: openspec-superpowers
description: Use when OpenSpec workflow is already active (for example, /opsx-* commands or work in openspec/changes/*) and superpowers discipline is needed during that change lifecycle.
---

# OpenSpec Superpowers

## Overview

Layer superpowers rigor onto an already active OpenSpec workflow.

Core principle: OpenSpec owns workflow state; superpowers adds execution discipline.

Routing is one-way: OpenSpec -> superpowers hooks only.

## When to Use

- OpenSpec workflow is already active and user references OpenSpec actions
- User references `/opsx-*` commands in current work
- User is working in `openspec/changes/*`
- Superpowers workflow is already running and OpenSpec context is explicitly present

Do not use this skill when OpenSpec workflow is not active. For superpowers-only work, continue normal superpowers workflow as usual.

## Router Flow

1. **Preflight**
   - Confirm active OpenSpec context (`/opsx-*`, `openspec/changes/*`, or explicit change context).
   - If not active, do not route into OpenSpec.

2. **Route by intent**
   - Explore/shape: `superpowers:brainstorming`, then continue `/opsx:explore` or `/opsx:propose`.
   - Implement: `superpowers:test-driven-development`, then continue `/opsx:apply`.
   - If blocked: `superpowers:systematic-debugging`, then continue `/opsx:apply`.
   - Pre-finish gate: `superpowers:verification-before-completion` (+ optional `superpowers:requesting-code-review`).
   - Close out: `superpowers:finishing-a-development-branch`, then `/opsx:archive`.

3. **Continuity rule**
   - If superpowers started first, continue the current stage as usual.
   - When OpenSpec context appears, layer OpenSpec guardrails onto the ongoing flow.
   - Never restart/replace an active superpowers flow.

4. **State source**
   - For active OpenSpec work, keep status and tasks in OpenSpec artifacts.

## Quick Reference

| Intent                                         | Superpowers hook                                                       | OpenSpec action                          |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| Plan change                                    | `brainstorming`                                                        | `/opsx:explore` or `/opsx:propose`       |
| Implement change                               | `test-driven-development`                                              | `/opsx:apply`                            |
| Failures during apply                          | `systematic-debugging`                                                 | continue `/opsx:apply`                   |
| Finish change                                  | `verification-before-completion` (+ optional `requesting-code-review`) | `/opsx:verify` then `/opsx:archive`      |
| Superpowers started first, OpenSpec now active | continue current superpowers stage                                     | continue active `/opsx-*` flow, no reset |
| Superpowers-only task                          | continue normal superpowers workflow                                   | do not route to OpenSpec                 |

## Guardrails

- Never route superpowers-only work into OpenSpec.
- Never restart/replace an active superpowers flow when OpenSpec appears.
- Never replace OpenSpec artifacts (`proposal.md`, `design.md`, `tasks.md`) with external plans.
- Never archive before verification unless user explicitly accepts risk.

## Common Mistakes

- Starting OpenSpec from a superpowers-only request.
- Skipping superpowers hooks because `/opsx:apply` exists.
- Tracking OpenSpec progress outside OpenSpec artifacts.
- Resetting superpowers flow when OpenSpec context appears.
