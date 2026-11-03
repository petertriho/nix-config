"""Payment webhook handling."""
import os
import time

MAX_ATTEMPTS = 5


class WebhookError(Exception):
    pass


def deliver_with_retry(payload: dict, deliver, sleep=time.sleep) -> None:
    """Post to the ledger with exponential backoff: 1, 2, 4, 8, 16 seconds."""
    for attempt in range(MAX_ATTEMPTS):
        try:
            return deliver(payload)
        except ConnectionError:
            sleep(2**attempt)
    raise WebhookError(f"ledger unreachable after {MAX_ATTEMPTS} attempts")


def handle_payment_event(event: dict, deliver) -> None:
    """Apply one payment event. `deliver` posts the entry to the ledger service."""
    if not os.environ.get("PAYMENTS_WEBHOOK_SECRET"):
        raise WebhookError("PAYMENTS_WEBHOOK_SECRET is not set")
    if event.get("type") != "invoice.paid":
        return
    # TODO: skip events whose id is already in the processed_events table.
    deliver_with_retry({"account": event["account"], "amount": event["amount"]}, deliver)
