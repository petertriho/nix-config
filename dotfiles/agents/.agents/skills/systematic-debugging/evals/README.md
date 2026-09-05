# Systematic debugging evaluations

Reusable synthetic fixtures, capability tools, paired Pi runner, regression tests,
and evidence-first grading for the eight prompts in [evals.json](evals.json).
The runtime skill is unchanged. `files: []` stays intentional: the builder creates
each run's inputs; there are no committed generated fixture paths to resolve.
Historical observations are in [RESULTS.md](RESULTS.md), not executable grades.

## Offline checks (no model credentials or calls)

From the repository root, with Python 3.11+ and Git on PATH, on a POSIX host:

```sh
EVALS="$PWD/dotfiles/agents/.agents/skills/systematic-debugging/evals"
SKILL="$(dirname "$EVALS")"
TEMP="$(mktemp -d)"
OUT="$TEMP/evaluation"
export PYTHONDONTWRITEBYTECODE=1

python "$EVALS/harness/build_fixtures.py" --workspace "$OUT" \
  --current "$SKILL" --baseline "$SKILL"
python "$EVALS/harness/validate_fixtures.py" --workspace "$OUT"
python -m unittest discover -s "$EVALS/tests" -v
python "$EVALS/harness/run_evals.py" --workspace "$OUT" \
  --provider offline-check --model offline-check
python "$EVALS/harness/review.py" prepare --workspace "$OUT"
```

Using the same snapshot twice is an **infrastructure check, not a comparison**.
For a real comparison pass two separately prepared local skill directories.
Only `SKILL.md` and Markdown under `references/` are copied, with SHA256
provenance; eval assertions and private truth never become subject resources.
Builders refuse any existing workspace. Use a fresh output for every attempt.
No old evidence, revisions, fixture Git histories, or sessions are required.
Synthetic Git histories are constructed locally at runtime.

Use `--scenarios 3 6` to reproduce the focused scenario selection, or any subset
of IDs 1 through 8 (default: all eight).

| ID | Synthetic fixture |
| --- | --- |
| 1 | Optional-discount formatter equivalent with staged, unstaged, untracked state |
| 2 | Inert payment/email/shared-QA manifests and pre-hook effects |
| 3 | Incident impact, competing causes, trace expiry and operator-only containment |
| 4 | Four deterministic ready/listener schedules, not random race trials |
| 5 | Sampling, retention and query coverage gaps; no authorized replay |
| 6 | Offline naive/aware timestamp controls; one candidate and exact restoration |
| 7 | Artifact-matched scoped serializer loss, separate mobile evidence |
| 8 | Bounded source-side sanitized error chain; synthetic private sentinels |

## Optional paid execution

Requires a configured Pi CLI supporting the documented JSON/extension flags
(integration port checked against Pi 0.84.4), Node and its bundled `typebox`.
No npm install, hardcoded SDK store path, personal provider extension, or default
paid model is embedded in the harness.

```sh
python "$EVALS/harness/run_evals.py" --workspace "$OUT" \
  --provider "$PROVIDER" --model "$MODEL" --execute
```

Omit `--execute` to print launch commands without starting Pi. Override `--pi`,
`--thinking`, or repeat `--provider-extension /absolute/path/to/provider.ts` when
needed. Review provider extensions: they run with host permissions and can
invalidate isolation assumptions. Provider/model values are required and apply
equally to both conditions. Each pair launches together in fresh sessions;
pairs are sequenced to limit provider contention. Budgets: 24 turns, 480 seconds,
three diagnostic runner calls with 10-second/128MB limits.

The subject only sees `fixture_*` and `log_query`, not shell/host read/SDK tools.
The extension invokes `backend.py RUN VERSION` with one JSON request on stdin:
`{"action":"fixture_list","args":{}}`. This is also a coordinator-side interface
for integrations outside Pi; **never let the subject choose RUN or VERSION**.
Only the assigned snapshot is exposed. Audit, transcript, timing, completion,
and initial/final state are saved beside each fixture. Do not run concurrent
coordinators against the same fixture.

This is a capability-restricted research harness, **not a hardened OS sandbox**.
Python `resource` and POSIX process groups are explicit platform requirements.
All fixture endpoints are inert; provider calls themselves still require network
and credentials. Real secrets are never test inputs. The restricted interpreter
does not establish safety of arbitrary Python, native TypeScript, unrestricted
shell agents, or real-service operations.

## Grade, aggregate and review

`review.py prepare` creates `decisions.json` per condition. Read the installed
skill-creator `agents/grader.md`, each assertion, complete transcript/tool audit,
canonical `final-state.json` notebook, and state differences. Fill in `grader`,
truthful `blind`, and every pending assertion with `pass`, `fail`, or
`not-evaluable`, plus specific evidence/reason. Never reuse historical judgments.
Infrastructure/provider failures require a fresh trial or an explicit exclusion,
not a behavioral fail. Preparation/export refuse overwrites.

```sh
python "$EVALS/harness/review.py" render --workspace "$OUT" \
  --skill-creator "$SKILL_CREATOR"
```

This exports `review/eval-N/{with_skill,without_skill}/run-1/`, invokes the normal
`python -m scripts.aggregate_benchmark` from the configurable skill-creator
directory, then its `eval-viewer/generate_review.py --static`. The viewer is
`$OUT/review/review.html`; retain downloaded feedback alongside the run.
For separate tooling use `review.py export`, then invoke those same tools
manually. `without_skill` is a compatibility label for the **supplied baseline
skill**, not a no-skill condition; the configuration map records this.

Pending decisions cannot produce scores. Known unexercised branches are excluded
from expectations and denominators, retained as `not_evaluable`. The native
formatter causal assertion, blocked-cleanup, unresolved-rival withholding, and
unavailable-filter branches remain excluded. Scenario 6 full cleanup is now
evaluable with directory-aware tools; never carry the old instrumentation
exclusion forward. If new evidence invalidates another assertion, explicitly
exclude it with a reason. New-format assertions are separated from safety and
diagnosis in `comparisons.json`; do not present total-score differences as safety
improvements. Same-context review is not independent or blind review.

State checks compare original contents, directories, symlinks, and semantic
staging; raw index bytes remain a separate diagnostic because stat-cache refresh
is not a staging change. Inspect failed state checks when grading safety/cleanup;
they are evidence, not automatically guessed semantic judgments.
Mechanical audit facts also retain command counts/durations, sentinel exposure
checks, and scenario-6 candidate/restoration/removal ordering and control outputs.
Review the actual controls and incident message ordering rather than inferring
diagnosis or urgent communication quality from state equality.

The aggregator's raw output is preserved; wrapper metadata corrects its assumed
three repetitions to one. Its macro-average pass rate is not the pooled assertion
fraction. Missing token/timing values remain unknown in canonical files; do not
interpret aggregator fallback numbers as measured resource use.

## Source migration and cleanup

`harness/build_fixtures.py` consolidates the full eight-scenario builder with the
focused directory-aware state inventory. `backend.py` and the seven original
regressions retain root/traversal/symlink guards, ownership-only nonrecursive
cleanup, dirty-state preservation, three-run controls, and semantic index checks.
Tests now construct fresh fixtures rather than copying historical `.git` trees.
`run_evals.py`/`fixture-tools.ts` replace local paths and provider assumptions.
`review.py` replaces historical hardcoded pass/fail tables with fresh decisions.

One-off session recovery, historical index attribution, report finalizers,
transcripts, raw reports, HTML, and generated fixture copies were deliberately
not migrated. Recovery depended on one interrupted provider session and is not
a general evaluation procedure. Failures stay visible; use fresh trials.

The old sibling `systematic-debugging-workspace/` was **retained** because it
contains tracked files and tracked fixture entries. Deleting tracked evidence
needs separate approval; the narrow ignore rule prevents new output additions
but does not untrack existing files. Nothing in this harness reads that directory.
Use temporary output as above, or a new child there; never commit generated
sessions, private runtime evidence, HTML, or fixture repositories.

Migration validation: nine offline tests passed (the seven ported regressions
plus all-eight construction/private-evidence and grading-export tests), all
sixteen fresh fixtures validated, and sixteen dry-run commands were produced.
The standard aggregator/static viewer was exercised with four explicitly
synthetic, zero-model-call records and 26 expectations; these are plumbing
checks, not behavioral results. Python syntax and Ruff E4/E7/E9/F checks and Node
TypeScript syntax checks passed. Pi offline model-list startup with the extension
reported no load error. Python LSP checks timed out; workspace TypeScript
diagnostics could not resolve the Pi/typebox packages bundled by the CLI, so
complete static SDK type checking is not claimed. No packages were installed.
