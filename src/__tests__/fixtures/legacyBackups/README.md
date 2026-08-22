# Golden legacy backup fixtures

These fixed ciphertext files protect restore compatibility independently of the
current backup writer. Each decrypts with `golden-backup-password` to the same
version 5 JSON database export, prefixed by a UTF-8 BOM.

| File | Format details | SHA-256 of trimmed ciphertext |
|---|---|---|
| `wc1-legacy-json.enc` | PBKDF2-SHA256, 100,000 iterations; AES-256-GCM | `2f43e86a8dddc03d903aa0bd6c8e4805a3b7caf0f858d821ca6c0b9fb45c5cf6` |
| `wc2-legacy-json.enc` | PBKDF2-SHA256, stored 600,000 iterations; AES-256-GCM | `290e77502f8df931041d87fda1fe7146798e2df289e1bedf9de7bdbeecc81a6b` |
| `cryptojs-legacy-json.enc` | CryptoJS/OpenSSL salted AES passphrase envelope | `d86bd51eb2c4ea41b852c19a7d63cc63a287b79219c5cdc53d1ecb1fb263abb4` |

The salts and IVs are intentionally fixed because these are compatibility test
artifacts, not real user backups. Do not regenerate them with the current
writer: doing so would allow a writer and reader regression to agree with each
other while silently dropping support for previously stored bytes.
