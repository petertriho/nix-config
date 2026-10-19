## Cache

The cache stores responses from the upstream API and the session store keeps auth tokens. When it fills up, it evicts the oldest entries. This makes requests 3x faster. The cache is configured in `cache.toml`; set `max_entries` to change the size.

Entries expire after 10 minutes.
