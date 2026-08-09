# Review Checklists

Use these as candidate prompts, not as a quota. Report only issues supported by
code and project context.

## Severity

- **CRITICAL**: an exploitable vulnerability, likely data loss or corruption, or
  a change likely to cause a major production outage or crash.
- **HIGH**: a concrete bug, contract break, serious error-handling gap, unsafe
  type or concurrency behavior, or a security weakness with meaningful impact.
- **MEDIUM**: a reliability or maintainability problem with a plausible failure
  mode, difficult future change, or meaningful test gap.
- **INFO**: an optional improvement with clear value but no present correctness or
  reliability requirement.

Severity follows impact and likelihood, not code size or reviewer preference.

## Common Checks

### Correctness and contracts

- Boundary conditions, empty inputs, missing values, overflow, ordering, and
  state transitions.
- Behavior that contradicts public APIs, schemas, types, documentation, or
  established call-site assumptions.
- Partial updates, non-atomic sequences, stale reads, duplicate processing, and
  retry behavior.
- Incorrect defaults, feature flags, environment handling, or configuration
  precedence.

### Errors and observability

- Errors swallowed, converted to success, stripped of useful context, or handled
  at the wrong boundary.
- Cleanup omitted on failure paths.
- Logs or metrics that expose secrets, misstate outcomes, or make failures
  impossible to diagnose.
- Retry, timeout, cancellation, and idempotency behavior at external boundaries.

### Security and trust boundaries

- Missing authorization or validation.
- Injection into SQL, shells, templates, paths, URLs, or interpreters.
- Path traversal, unsafe file permissions, insecure temporary files, or archive
  extraction issues.
- Secret exposure, insecure randomness, unsafe deserialization, request forgery,
  cross-site scripting, or cross-site request forgery.
- Client-controlled values trusted after crossing a server or persistence
  boundary.

### Resources and concurrency

- Handles, transactions, locks, processes, connections, streams, or goroutines
  not released on every path.
- Races, deadlocks, lost wakeups, unbounded work, shared mutable state, or
  cancellation leaks.
- Work performed after ownership or lifecycle has ended.

### Maintainability with concrete impact

- Duplicated business rules that can drift.
- Control flow whose nesting or mutation obscures a real failure path.
- An abstraction that changes semantics unexpectedly or forces callers to know
  hidden ordering and setup rules.
- Names that materially misrepresent units, ownership, side effects, or domain
  meaning.

### Tests

- Changed behavior lacks coverage through a stable public interface.
- Tests prove helper internals but miss the user-visible path affected by the
  change.
- A regression can pass because assertions are too broad, fixtures are invalid,
  or failures are mocked away.

## TypeScript and JavaScript

- Unsafe `any`, assertions, unchecked casts, or runtime data trusted as typed.
- Missing `await`, floating promises, asynchronous errors, and cleanup across
  abort or rejection paths.
- Nullish values, optional properties, array or map lookup misses, and narrowing
  invalidated by mutation.
- Module initialization order, browser/server boundary mistakes, and stale
  closure state.
- Prototype pollution, unsafe DOM insertion, command/query construction, and
  leaked credentials.

## Python

- Bare or overly broad exception handling, exception context lost, and success
  returned after failure.
- Mutable defaults, shared class state, iterator exhaustion, and truthiness that
  confuses valid zero/empty values with absence.
- Files, locks, transactions, and network resources used without reliable context
  management.
- Blocking work in async paths, orphaned tasks, and cancellation mishandling.
- Path traversal, unsafe subprocess construction, insecure deserialization, and
  SQL/template injection.

## Go

- Ignored errors, missing error context, incorrect sentinel handling, and cleanup
  skipped after partial initialization.
- Goroutine leaks, blocked channels, races, copying synchronization values, and
  context cancellation not propagated.
- Nil interface surprises, nil maps, slice aliasing, loop-variable capture, and
  defer placement in long-running loops.
- Interfaces broader than callers need when that hides contract mistakes.
- Unsafe path/query construction and trust-boundary validation gaps.

## Rust

- `unwrap`, `expect`, indexing, or panic paths reachable from ordinary runtime
  input.
- Unsafe blocks without a proven invariant, or safe wrappers that fail to enforce
  the invariant.
- Unnecessary clones that conceal ownership mistakes, incorrect lifetime
  assumptions, or interior mutability used without a clear synchronization rule.
- Integer narrowing, overflow behavior, unchecked conversions, and buffer or
  slice boundary mistakes.
- Error types that lose actionable context or expose sensitive internals.

## Java

- Missing null handling, misleading `Optional` use, and autounboxing surprises.
- Catching `Throwable` or broad `Exception` in ways that hide failures; empty or
  lossy catch blocks.
- Resources not protected by try-with-resources and transactions not finalized
  on every path.
- Shared mutable state, unsafe publication, incorrect synchronization, and
  executor lifecycle leaks.
- Injection, unsafe deserialization, path traversal, and authorization gaps.

## Frontend and Accessibility

- Keyboard reachability, focus order and restoration, accessible names, semantic
  roles, and announcements for dynamic state.
- Loading, empty, error, disabled, and partial-data states that preserve the user's
  task and do not trap interaction.
- Unsafe HTML insertion, URL handling, hydration mismatches, stale UI state, and
  responsive layouts that hide required controls or information.

## Data and Migrations

- Backward and forward compatibility while old and new application versions
  coexist.
- Idempotency, transaction boundaries, rollback behavior, partial backfills, and
  retry safety.
- Nullability, defaults, destructive transformations, index or lock impact, and
  assumptions about existing production data.

## Shell, Nix, Configuration, and Infrastructure

- Shell quoting, globbing, word splitting, pipeline failures, temporary files, and
  destructive commands operating on validated paths.
- Nix option merge behavior, purity, platform guards, dependency references, and
  activation-time side effects.
- Configuration precedence, secret handling, file permissions, service lifecycle,
  restart behavior, and changes whose deployment order affects compatibility.

## Generic Fallback

For other languages, apply the common checks and inspect language-specific risks
visible in project tooling, nearby code, and tests. Do not treat an unfamiliar
extension as automatically safe or automatically suspicious.

## Counter-Signals

Do not report a finding merely because:

- Code differs from personal style but follows project conventions.
- A function is long yet cohesive and covered by meaningful tests.
- A small wrapper hides a real external boundary or repeated caller obligation.
- A check appears redundant but protects a trust boundary or documents an
  invariant.
- A possible issue requires an unstated future requirement.
- A diagnostic is suppressed with a documented, locally valid reason.
- The same root cause has already been reported more precisely elsewhere.

A finding should answer: what fails, under which conditions, where the evidence
is, why it matters, and what kind of correction would address it.
