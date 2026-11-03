# Session transcript (2026-11-03, notes-api)

**User (10:02):** the ledger keeps getting double entries from the payment
webhook in staging. I'm on fix/payment-webhook-retries. here's my env so you
can see what I'm running with:

```
export PAYMENTS_WEBHOOK_SECRET=pws_live_7Hq2Zx9LmA4cR8tV1nB6
export LEDGER_DATABASE_URL=postgres://ledger:Tr0ub4dor-staging@db.internal.example:5432/ledger
```

**Assistant:** Read `notes_api/billing.py`. `handle_payment_event` calls
`deliver` once with no retry. When the ledger times out, the payment provider
re-sends the event, and the handler has no record that it already applied it.

**User (10:15):** I ran the replay script on my machine against staging, 3 of
the last 40 invoice.paid events were applied twice. so it's real.

**Assistant:** Two changes would fix this: retry the ledger call with
backoff, so fewer events fail; and skip events that were already applied,
keyed by the event id.

**User (10:20):** yes. 5 attempts max, exponential. use the event id as the
idempotency key, the provider guarantees it's unique.

**Assistant (tool):** Added `deliver_with_retry` to `notes_api/billing.py`:
5 attempts, sleeps of 1, 2, 4, 8, 16 seconds, then raises `WebhookError`.
Wired it into `handle_payment_event`. Added a TODO for the dedupe check. Did
not run any tests: there are no billing tests yet.

**User (10:41):** for dedupe we need a processed_events table (event_id
primary key, applied_at). migration isn't written yet. and nobody deploys
this to staging without Marco's sign-off, he owns the ledger.

**Assistant:** Noted. Open items: the `processed_events` migration, the
dedupe check, tests for retry and dedupe, and Marco's sign-off before any
staging deploy.

**User (11:05):** I tried wrapping the deliver call in a db transaction
instead of a dedupe table, but the ledger is a separate service so the
transaction doesn't cover it. dead end.

**User (11:30):** heads up, Priya is taking this over. she knows the codebase
but wasn't in any of this.
