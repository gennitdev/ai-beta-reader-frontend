# Platform and persistence acceptance evidence

This document tracks the platform/persistence portion of
[`book-folder-format.md`](../book-folder-format.md). A passing hermetic test is
useful codec evidence, but it is not recorded as real filesystem, IndexedDB, or
native SQLite evidence unless that storage implementation actually ran.

## Evidence levels

- **Real automated:** the shipped persistence implementation runs against its
  real storage engine and the result is asserted after reopening it.
- **Hermetic:** production orchestration runs with a fake, mock, or in-memory
  persistence boundary.
- **Manual:** a repeatable procedure has a dated result and retained artifact.
- **Not verified:** no qualifying result has been recorded.

## Platform matrix

| Environment | Database | Recovery and images | Bundle/restore evidence | Duplicate-path evidence | Current result |
|---|---|---|---|---|---|
| Chromium browser on Linux CI | Real `sql.js` and IndexedDB in Playwright | Real browser stores, mocked Drive HTTP | `e2e/cloud-sync.spec.ts` restores a book/chapter; it does not cover the complete persistence fixture or a forced rollback | Hermetic normalization tests only | Partial real automated |
| Browser on macOS | `sql.js` and IndexedDB | IndexedDB recovery and image stores | No recorded run | No recorded filesystem extraction | Not verified |
| Browser on Windows | `sql.js` and IndexedDB | IndexedDB recovery and image stores | No recorded run | No recorded filesystem extraction | Not verified |
| Electron on Linux | `sql.js` and IndexedDB | App-data filesystem recovery/images | Electron bridge tests mock Node filesystem calls; no packaged-app restore | No recorded extraction | Hermetic only |
| Electron on macOS | `sql.js` and IndexedDB | App-data filesystem recovery/images | No recorded packaged-app run | No recorded case-insensitive filesystem run | Not verified |
| Electron on Windows | `sql.js` and IndexedDB | App-data filesystem recovery/images | No recorded packaged-app run | No recorded case-insensitive filesystem run | Not verified |
| Android | Native Capacitor SQLite | Native recovery directory; image binaries are not supported | Capacitor filesystem and transaction APIs are mocked; the instrumentation test is only a generated context check | No recorded device/emulator run | Not verified; image limitation |
| ZIP extraction on macOS/Windows/Linux | N/A | N/A | Central-directory safety is hermetic | Real filesystems have not been exercised | Not verified |

The Android image limitation is documented in
[`cloud-sync.md`](../cloud-sync.md#architecture-overview): Android currently
stores image metadata without a local image-binary store. Therefore a full
image-preserving Android backup/restore cannot be marked passing.

## Acceptance evidence map

| ID | Book-folder criterion | Current automated evidence | Level | Remaining evidence |
|---|---|---|---|---|
| BFF-AC-01 | Every persistent table round-trips through a full bundle | `libraryBundleWriter.spec.ts`, `libraryBundleReader.spec.ts`, `logicalDatabaseDump.spec.ts` use the complete canonical fixture | Hermetic | Repeat against browser IndexedDB, Electron, and native SQLite, then reopen and compare logical dumps |
| BFF-AC-02 | Drive restore preserves revisions, activity, images, links, summaries, reviews, profiles, and audit records | `cloudBundleSync.spec.ts` asserts the complete model through mocked Drive/database/recovery/image stores | Hermetic | Full UI/persistence acceptance on each runtime |
| BFF-AC-03 | Selection/text-only cannot Replace | `libraryBundlePlan.spec.ts` and import UI tests | Hermetic | Browser UI smoke test is sufficient; platform storage does not change this boundary |
| BFF-AC-04 | Divergent local/incoming edits conflict before writes | Planner/import tests | Hermetic | Browser UI evidence with unchanged persisted generation before resolution |
| BFF-AC-05 | Renamed paths do not change database entities | Reader/planner tests | Hermetic | Import from real directories where supported |
| BFF-AC-06 | Duplicate titles do not collide on macOS, Windows, Linux, Android, or ZIP extraction | `libraryBundleWriter.spec.ts` proves ID-suffixed paths; `libraryBundleTransport.spec.ts` rejects normalized collisions | Hermetic | Create/extract the fixture on every named filesystem and retain path listings |
| BFF-AC-07 | Hostile archives fail before database writes | Transport/validator tests assert failures before mocked import | Hermetic | Resource-limit work is tracked separately; retain minimized failing fixtures |
| BFF-AC-08 | Replace waits for external verified recovery | Recovery service/replacement tests use memory, fake IndexedDB, and mocked filesystem bridges | Hermetic | Verify recovery bytes survive app restart in browser, Electron, and Android |
| BFF-AC-09 | Transaction/import failure leaves the prior library usable | In-memory sql.js and mocked native transaction/Replace rollback tests | Hermetic | Inject failure at row write, commit, browser snapshot, native persistence, and image write; reopen the app and compare the prior logical dump |
| BFF-AC-10 | Every supported legacy encryption generation restores | Fixed WC1, WC2, and CryptoJS ciphertext under `src/__tests__/fixtures/legacyBackups/`, exercised through `CloudSync.restore` in `cloudSync.spec.ts` | Hermetic golden | Keep fixtures immutable; no platform-specific crypto path exists |

## Repeatable real-persistence procedure

Use the complete logical-database fixture for each environment. Record the app
version, commit, OS/runtime version, device/filesystem, result, and attach the
before/after logical dumps plus recovery metadata.

1. Start from an empty profile and import the complete fixture, including image
   bytes, revisions, activity, links, summaries, reviews, profiles, and audit
   records.
2. Close and reopen the app. Export a logical dump and save its SHA-256.
3. Create a canonical backup. Mutate every data category and add a book whose
   title differs only by case/Unicode normalization from another title.
4. Restore with Replace. Confirm that recovery confirmation is unavailable
   until the external recovery has been written, read back, and verified.
5. Close and reopen the app. Compare the restored logical dump with the source
   dump and verify decoded image bytes separately.
6. Repeat with an injected failure at each persistence boundary. Reopen the app
   and verify the pre-operation logical dump and images remain usable.
7. Export and extract duplicate-title paths on the host filesystem. Attach a
   sorted path listing showing distinct ID-suffixed paths and no overwrite.

Until a row above has real automated or dated manual evidence, it remains a
release-hardening gap rather than an inferred pass from adapter mocks.
