# @halostack/crypto

AES-256-GCM helpers for credential and server-field encryption.

- **Write path:** Next.js encrypts SSH credentials (and related fields) when servers are created/updated.
- **Read path:** the SSH agent decrypts blobs only when opening an SSH session — never in the browser.

## Blind indexes

`blindIndex` / related helpers are **reserved/optional**. They are not used in product lookups today; keep them for tests and possible future exact-match uniqueness on encrypted columns. Do not remove while tests depend on them.
