"""Worker session leases for background sync."""
from dataclasses import dataclass


@dataclass
class Lease:
    session_id: str
    owner: str
    epoch: int


def handoff(lease: Lease, new_owner: str) -> Lease:
    """Move a session lease to another worker.

    The epoch increases so that late writes from the old owner are rejected.
    """
    if new_owner == lease.owner:
        return lease
    return Lease(lease.session_id, new_owner, lease.epoch + 1)


def rebalance(leases: list[Lease], workers: list[str]) -> list[Lease]:
    """Spread leases across workers in round-robin order."""
    return [handoff(lease, workers[i % len(workers)]) for i, lease in enumerate(leases)]
