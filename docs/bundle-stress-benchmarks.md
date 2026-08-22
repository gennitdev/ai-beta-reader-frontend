# Bundle stress benchmarks

Issue [#132](https://github.com/gennitdev/ai-beta-reader-frontend/issues/132) tracks release-hardening for large libraries. The stress runner exercises the same export, ZIP validation, preview, Apply, recovery creation, and Replace functions used by the application. Large data is generated deterministically at runtime; no large archive is committed.

## Commands

```sh
# Fast local feedback; records results without enforcing CI ceilings.
npm run benchmark:bundle

# Pull-request scale with deterministic seed and deliberately generous gates.
npm run benchmark:bundle:ci

# Opt-in workstation/nightly characterization. This does not enforce PR gates.
npm run benchmark:bundle:nightly
```

Override the seed or artifact path with `--seed=<integer>` and `--output=<path>`. The default report is `artifacts/bundle-stress.json`; generated artifacts are ignored by Git and uploaded by CI.

## Scales and expectations

| Scale | Shape | Binary payload | Use |
| --- | --- | ---: | --- |
| `smoke` | 40 chapters, 80 revisions, complete related records | 128 KiB | local iteration |
| `ci` | 500 chapters, 2,000 revisions, complete related records | 2 MiB | blocking pull-request regression check |
| `nightly` | 2,000 chapters, 20,000 revisions, complete related records | 50 MiB | opt-in platform characterization |

The CI scale uses a fixed seed (`132202608`). Each measured phase must complete within 30 seconds, all five measured phases within 150 seconds, and process peak RSS must remain below 1,280 MiB. These are catastrophe guards, not product performance promises. They leave headroom for shared GitHub runners while still catching quadratic behavior or accidental binary multiplication. Tighten a limit only after at least ten comparable CI reports show that the new limit is above twice the observed p95 (or p95 plus five seconds / 128 MiB, whichever is larger).

The JSON report records runtime, platform, architecture, seed, fixture dimensions, entity/file/input sizes, per-phase duration, current memory, process high-water RSS, Replace/recovery sizes, and threshold violations. Compare like-for-like reports: RSS is a process-wide high-water mark, and timings from different platforms are not interchangeable.

The Replace measurement uses the production verified-recovery path and a bounded in-memory persistence sink. Real IndexedDB, Electron filesystem, and Android persistence timing belongs to the platform acceptance matrix so this deterministic Node benchmark remains repeatable in CI.
