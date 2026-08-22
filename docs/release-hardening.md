# Library bundle release hardening

Issue [#132](https://github.com/gennitdev/ai-beta-reader-frontend/issues/132) is split into four independently verifiable tracks. A track is complete only when its automated result or repeatable manual procedure is linked from the acceptance-evidence table below.

## Work tracks

| Track | Scope | First deliverable | Completion evidence |
|---|---|---|---|
| Fuzzing | YAML, Markdown frontmatter, directory paths, ZIP metadata, Unicode/case collisions, traversal, compression and size boundaries | Deterministic property suite with replayable seeds and retained counterexamples | CI fuzz result plus any counterexample artifact |
| Stress benchmarks | Export, validation, preview, Apply and Replace at repeatable large-library scales | Seeded fixture generator and isolated time/peak-memory runner | Versioned JSON benchmark report with CI-safe resource gates |
| Platform matrix | macOS, Windows, Linux, Android/native storage and ZIP extraction | Supported-environment matrix with duplicate-title/path procedures | Per-platform result artifact and documented limitations |
| Real persistence | Full backup/restore, recovery creation, restart durability and rollback using platform persistence | Common full-library acceptance scenario | Logical-dump comparison before/after restart and fault-injection result |

## Platform matrix

Results remain **not run** until executed on the named environment; unit tests with mocked adapters do not qualify.

`.github/workflows/bundle-platform.yml` runs the real Chromium IndexedDB recovery/Replace scenario plus focused portable-path and transport suites on hosted macOS, Windows and Linux runners. Those results qualify the browser rows only; they do not qualify Electron, Android or real directory-filesystem rows.

| Runtime | OS | Database | Recovery/image persistence | ZIP | Directory | Duplicate case/Unicode | Restart/rollback | Status |
|---|---|---|---|---|---|---|---|---|
| Browser Chromium | Linux | IndexedDB/sql.js | IndexedDB / browser image store | Required | Read required | Required | Required | Not run |
| Browser Chromium | macOS | IndexedDB/sql.js | IndexedDB / browser image store | Required | Read/write where supported | Required | Required | Not run |
| Browser Chromium | Windows | IndexedDB/sql.js | IndexedDB / browser image store | Required | Read/write where supported | Required | Required | Not run |
| Electron | Linux | sql.js | app-data filesystem | Required | Required | Required | Required | Not run |
| Electron | macOS | sql.js | app-data filesystem | Required | Required | Required | Required | Not run |
| Electron | Windows | sql.js | app-data filesystem | Required | Required | Required | Required | Not run |
| Android | Supported Android versions | Native SQLite | Capacitor filesystem | Required | Platform-dependent | Required | Required | Not run |

Android currently restores canonical image metadata without a native image-byte store. This is a known release limitation until native image persistence is implemented and accepted, or the supported behavior is narrowed explicitly.

Browser ZIP selection is limited to 256 MiB of compressed archive data before materialization. Expanded content remains subject to the codec's file-count, total-size, individual-file, path-length and compression-ratio limits. Larger libraries require a supported directory workflow or a platform-specific transport with streaming validation.

## Acceptance evidence

| ID | Design criterion | Current automated evidence | Remaining release evidence |
|---|---|---|---|
| BFF-AC-01 | Every persistent table round-trips losslessly | `libraryBundleSnapshot.spec.ts`, `libraryBundleReader.spec.ts` | Real-persistence logical dump on every supported runtime |
| BFF-AC-02 | Full Drive restore preserves revisions, activity, images, links, summaries, reviews, profiles and audit records | `cloudBundleSync.spec.ts` with mocked persistence | Full scenario against each platform persistence layer |
| BFF-AC-03 | Partial/text-only bundles cannot Replace | `libraryBundleReader.spec.ts`, `LibraryBundleImport.spec.ts` | Repeatable UI acceptance procedure |
| BFF-AC-04 | Conflicts block writes until resolution | `libraryBundlePlan.spec.ts`, `useLibraryBundleImport.spec.ts` | Browser UI acceptance procedure |
| BFF-AC-05 | Path-only renames cause no database change | `libraryBundleReader.spec.ts` | Filesystem acceptance on desktop and Android |
| BFF-AC-06 | Duplicate titles do not collide | `libraryBundleWriter.spec.ts`, `libraryBundleTransport.spec.ts` | Every platform-matrix row and ZIP extraction |
| BFF-AC-07 | Hostile archives fail before database writes | `libraryBundleTransport.spec.ts`, deterministic fuzz suite | Forged ZIP metadata and UI pre-materialization limits |
| BFF-AC-08 | Replace waits for verified external recovery | `libraryReplacement.spec.ts`, `e2e/bundle-persistence.spec.ts` | Real recovery store on Electron and Android |
| BFF-AC-09 | Transactional failure leaves prior library usable | `libraryReplacement.spec.ts`, `transaction.spec.ts` | Fault injection plus restart on real persistence |
| BFF-AC-10 | Every supported legacy encryption generation restores | Generated WC1/CryptoJS tests | Checked-in golden WC1, WC2 and CryptoJS ciphertext fixtures |

## Repeatable real-persistence scenario

Seed all mapped tables and nontrivial image bytes, export a full backup, mutate or wipe the library, restore, and compare the versioned logical dump. Verify revisions, activity, images, wiki links, summaries, reviews, profiles and audit records through the application; confirm the recovery exists outside the main database; restart; and compare again. Repeat with injected failures at image write, database import, commit, persistence snapshot and rollback boundaries.

The browser acceptance test automates the first real-persistence slice: it downloads a full bundle, creates post-backup data, prepares and verifies recovery in the separate `beta-bot-recovery` IndexedDB database, performs Replace, reloads the application, and proves both restoration and deletion persisted. Broader entity coverage and fault injection remain required before BFF-AC-01, BFF-AC-02 and BFF-AC-09 are complete.
