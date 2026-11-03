"""Payment webhook handling."""
import os


class WebhookError(Exception):
    pass


def handle_payment_event(event: dict, deliver) -> None:
    """Apply one payment event. `deliver` posts the entry to the ledger service."""
    if not os.environ.get("PAYMENTS_WEBHOOK_SECRET"):
        raise WebhookError("PAYMENTS_WEBHOOK_SECRET is not set")
    if event.get("type") != "invoice.paid":
        return
    deliver({"account": event["account"], "amount": event["amount"]})
