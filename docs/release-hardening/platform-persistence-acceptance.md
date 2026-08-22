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
| Chromium browser on Linux | Real `sql.js` and IndexedDB in Playwright | Real app and separate recovery IndexedDB stores; mocked Drive HTTP only in cloud tests | `e2e/bundle-persistence.spec.ts` verifies recovery-before-Replace, successful restart durability, and one-shot snapshot-failure rollback after restart | `libraryBundleFilesystemAcceptance.spec.ts` materializes duplicate Unicode titles through directory and ZIP on the host filesystem | Partial real automated; local pass 2026-08-22 |
| Browser on macOS | `sql.js` and IndexedDB | IndexedDB recovery and image stores | Cross-OS workflow added; no passing run recorded yet | Host-filesystem acceptance is included in the pending workflow | Not verified |
| Browser on Windows | `sql.js` and IndexedDB | IndexedDB recovery and image stores | Cross-OS workflow added; no passing run recorded yet | Host-filesystem acceptance is included in the pending workflow | Not verified |
| Electron on Linux | `sql.js` and IndexedDB | App-data filesystem recovery/images | Electron bridge tests mock Node filesystem calls; no packaged-app restore | No recorded extraction | Hermetic only |
| Electron on macOS | `sql.js` and IndexedDB | App-data filesystem recovery/images | No recorded packaged-app run | No recorded case-insensitive filesystem run | Not verified |
| Electron on Windows | `sql.js` and IndexedDB | App-data filesystem recovery/images | No recorded packaged-app run | No recorded case-insensitive filesystem run | Not verified |
| Android | Native Capacitor SQLite | Native recovery directory; image binaries are not supported | Capacitor filesystem and transaction APIs are mocked; the instrumentation test is only a generated context check | No recorded device/emulator run | Not verified; image limitation |
| ZIP materialization on macOS/Windows/Linux | N/A | N/A | Central/local metadata is fuzzed before inflation | Linux local host filesystem passed; hosted macOS/Windows runs pending | Partial real automated |

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
| BFF-AC-06 | Duplicate titles do not collide on macOS, Windows, Linux, Android, or ZIP extraction | Writer/transport tests plus `libraryBundleFilesystemAcceptance.spec.ts` create distinct NFC-equivalent duplicate-title paths through real directory and ZIP materialization | Partial real automated | Record hosted macOS/Windows and Android results |
| BFF-AC-07 | Hostile archives fail before database writes | Deterministic properties fuzz paths, limits, YAML/frontmatter and forged central/local ZIP metadata; oversized browser ZIPs fail before archive/database materialization | Hermetic safety plus real UI boundary | Retain minimized failing artifacts and add Android transport evidence |
| BFF-AC-08 | Replace waits for external verified recovery | `e2e/bundle-persistence.spec.ts` verifies recovery exists in a separate real IndexedDB database before Replace and after reload | Partial real automated | Verify recovery bytes survive Electron and Android restart |
| BFF-AC-09 | Transaction/import failure leaves the prior library usable | Browser E2E injects a one-shot IndexedDB snapshot failure, rolls back from verified recovery, reloads, and verifies local-only content; native/unit paths remain hermetic | Partial real automated | Repeat at image, Electron filesystem, and Android native persistence boundaries |
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
