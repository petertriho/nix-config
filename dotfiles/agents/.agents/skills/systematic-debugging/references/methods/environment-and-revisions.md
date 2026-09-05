# Compare Environments and Revisions

## Compare effective environments

Build a compact working/failing matrix containing only relevant factors:
OS/architecture, runtime, artifact/build identity, dependency resolution,
effective configuration and provenance, feature state, permissions class,
endpoint/DNS/network route, certificate validity metadata, locale/clocks, and
resource limits.

Inspect declared versus effective state. A manifest version need not be the
loaded version; a configuration file need not win precedence. Do not dump
environments or hash sensitive configuration/low-entropy secrets. Compare
presence, source, non-sensitive structure, or approved non-secret fingerprints.

For external dependencies, compare sanitized contract/schema, status class,
latency, retry behavior, and correlation provenance on both sides. Provider
status or temporal correlation alone is not attribution. Prefer passive,
bounded evidence. Do not exercise real payment/email/queue endpoints simply
because the caller is a local process or QA test.

First establish whether the same artifact and input diverge across contexts.
Then isolate a relevant difference under the execution/experiment gates.
Otherwise retain the matrix as observational evidence with confounders.
“Works locally” does not prove the application is correct.

## Inspect changes conditionally

Recent changes include source, build inputs, resolved dependencies, runtime
images, configuration, data shape, permissions, and remote behavior. Use the
onset window and verified working/failing identities, not guessed revisions.

For Git history and endpoint snapshot comparison:

```text
git log -- <relevant-path>
git diff <known-working> <failing> -- <relevant-path>
```

The second command compares those two trees directly. A triple-dot diff instead
uses their merge base and can omit differences needed for this comparison.
Inspect commands through the execution gate, including unexpected external
diff/text conversion helpers where configured.

For non-Git systems, use manifests, build/release metadata, inventories,
configuration snapshots, or resolver records. Modification timestamps are weak
provenance. A change near onset is a lead; trace its mechanism into the first
divergence and record inspected changes that do not explain the path.

## Git bisection

Bisection localizes a transition; it does not prove the causal line or mechanism.
Read [experiment rules](isolated-experiments.md) and obtain exact approval
before creating a worktree, switching revisions, or writing bisect state.

### Preconditions

- Verified good/bad endpoints under the same predicate and signature check.
- A repeatable predicate and sufficiently monotonic behavior in searched history.
- Safe historical builds/tests with controlled credentials, dependencies,
  network, data, resource/run/time limits, and non-revision conditions.
- A clean approved disposable worktree, separate from active/dirty user work.

Record initial reference/commit, worktrees, protected paths, and any existing
bisect session. Never take over an existing session, stash/reset/clean user
changes, or execute uninspected historical hooks/build scripts.
If dependency/schema/environment drift makes a revision incomparable, skip it;
do not classify setup failure as the target bug.

### Procedure

In the approved isolated worktree:

```text
git bisect start <known-bad> <known-good> --
```

Run the predeclared predicate and mark `good`, `bad`, or `skip` from actual
observations. Automated `git bisect run <predicate-command>` is appropriate only
when bounded, deterministic, and safely mapped:

- `0`: target behavior good.
- `1`–`127`, except `125`: defining bad signature occurred.
- `125`: untestable revision; skip.
- Other statuses: abort.

Do not return a bad result for unrelated setup/build/timeout/infrastructure
errors. Abort if the procedure is untrustworthy. If a wrapper is needed,
include it in approval and keep it outside the revision-switched tree.
Stop on run/time budget, non-monotonic evidence, or too many untestable adjacent
revisions to identify a useful boundary.

Preserve `git bisect log`, commit/result evidence, and relevant first-bad diff
in sanitized notebook summaries. A commit may expose an older defect or bundle
multiple changes. Follow it with a causal trace/discriminating test.

### Records and restoration

Use a `GB#` record for authorization, worktree, endpoints, predicate,
tested/skipped revisions, result/range, limitations, and cleanup.
Nest revisions within one enclosing state epoch if epochs are needed; cite
the exact commit on each result. Start another epoch only for a material
non-revision condition change.

Run `git bisect reset` in the owned worktree and verify return to its starting
revision and absence of owned bisect state. Remove only the owned disposable
worktree/wrapper/artifacts after evidence preservation. Compare original
worktree content and registered worktrees with baseline. If restoration cannot
be proved, report exact state and mark cleanup blocked.
