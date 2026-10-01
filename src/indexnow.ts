/**
 * IndexNow (Bing/Yandex/etc.) ownership key. The key is PUBLIC by design — the protocol requires it to be
 * served openly at <site>/<key>.txt so engines can verify ownership — so it lives in the source, not in a secret.
 * Pinging is a separate, deliberate step: scripts/indexnow_ping.py (never run automatically).
 */
export const INDEXNOW_KEY = "c37096a3b4d01bbe528054cc91412083";
