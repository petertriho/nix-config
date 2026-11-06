# Session transcript (2026-11-04, notes-api)

**User (14:02):** the ledger shows 9.99 for invoices that were 9.995 in the
payment event. finance expects 10.00. is notes-api rounding the amount?

**Assistant:** Read `notes_api/billing.py`. `handle_payment_event` passes
`event["amount"]` to `deliver` as it is. notes-api does not round the amount.

**User (14:10):** then it's billing-service. it's at __OTHER__

**Assistant (tool):** Searched `__OTHER__/main` for "round". Found
`billing_service/ledger.py`: `to_cents()` calls `round(amount, 2)` on a
float. The float for 9.995 is slightly below 9.995, so it rounds to 9.99.

**Assistant:** The ledger rounds with `round()` on a float. The fix is to
parse the amount as `Decimal` and quantize it to two places with
`ROUND_HALF_EVEN`, then add a test for 9.995 and 0.125.

**User (14:18):** agreed, ROUND_HALF_EVEN is what finance wants. the fix
goes in billing-service, not here. I'll do it in a separate session there.
