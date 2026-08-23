# Evidence-Backed Canon Assistant

*Product and technical design for incremental continuity checking in beta bot*

**Status:** Draft for prototype decision

**Product:** beta bot

**Audience:** Product, design, and engineering

**Date:** August 23, 2026

> **Decision summary:** Build an evidence-backed canon assistant, not a graph-first continuity platform. The first product slice should identify wiki pages that may be stale after a chapter revision, cite exact passages, and let the author decide how canon changes. Use the same evidence and review primitives to add canon conflicts, explicit rule checking, and an author-confirmed thread ledger in later phases.

## 1. Executive summary

Long manuscripts accumulate changing facts, world rules, and unresolved narrative promises. Writers need help finding relevant changes without surrendering authority over canon or reviewing a noisy stream of speculative warnings.

beta bot already has the right foundation: local chapter revisions, structured summaries, wiki pages and chapter links, wiki update history, and per-page chapter review state. The proposed system extends those capabilities into an incremental review workflow instead of introducing a generalized knowledge-graph product.

The core interaction is a cited question, not an automated verdict. A useful result says, “Chapter 37 may conflict with this approved rule; here are the passages.” It never silently rewrites canon, declares an error, or calls a thread dropped.

## 2. Problem and product thesis

### 2.1 Problem

Authors of long or complex fiction must reconcile new prose with established character facts, setting details, cosmology, mysteries, and promises to the reader. Manual review is slow and memory-dependent. Generic AI consistency checks are difficult to trust because fiction routinely contains transformations, disguise, metaphor, unreliable narration, mistaken beliefs, rumors, and intentional contradiction.

### 2.2 Product thesis

Continuity assistance becomes trustworthy when it is bounded, incremental, evidence-backed, and author-governed. The product should retrieve only relevant canon, compare it with a specific changed chapter revision, cite both sides, and ask the author what the difference means.

### 2.3 Product principles

- Evidence before judgment. Every surfaced item includes exact source passages and locations.

- Questions before accusations. Use “possible conflict” and “may be outdated,” never an unqualified error declaration.

- The author owns canon. No automatic canon replacement, resolution, or thread classification.

- Precision over recall. Missing a marginal warning is less damaging than a permanent inbox of noise.

- Incremental by default. Analyze the current revision against relevant canon; reserve whole-book scans for explicit audits.

- Different objects, different behavior. Observed facts, approved rules, and narrative threads are modeled separately.

- Local-first and inspectable. Persist review state locally and show the exact prompt context before AI calls, consistent with beta bot’s current privacy model.

## 3. Goals, non-goals, and success criteria

### 3.1 Goals

- Reduce the work required to keep wiki pages current after chapter edits.

- Surface plausible canon conflicts with enough evidence for a quick author decision.

- Support explicit world-rule linting with exceptions and author notes.

- Create a low-pressure ledger for narrative threads that improves as the author classifies suggestions.

- Avoid repeated processing of the entire manuscript and keep token usage proportional to changed content.

### 3.2 Non-goals for the initial release

- A visual node-and-edge knowledge graph.

- Fully automatic wiki or canon updates.

- A manuscript-wide continuity score.

- Automatic declarations that a narrative thread is dropped.

- Extraction and retention of every mundane fact.

- A durable inbox of low-confidence warnings.

### 3.3 Prototype success criteria

| Dimension | Go/no-go criterion |
| --- | --- |
| Usefulness | Most surfaced items are worth reading. |
| Explainability | Every warning cites the new passage and the relevant canon or rule. |
| Discovery | The prototype finds stale pages or issues the author genuinely cares about. |
| Efficiency | Confirming or dismissing results is faster than checking manually. |
| Learning | Author corrections measurably improve later scans. |

## 4. Scope and phased delivery

| Phase | Capability | User value | Release gate |
| --- | --- | --- | --- |
| 1 | Wiki freshness | Shows new evidence involving a wiki entity since the page’s relevant chapter content was last reviewed. | High precision; review is faster than manual comparison. |
| 2 | Canon conflicts | Compares extracted claims with author-approved wiki facts and presents both passages. | Useful conflicts substantially outnumber distracting ones. |
| 3 | Rule cards | Checks a small set of author-defined laws and exceptions against new prose. | Rule violations are explainable and exceptions suppress false positives. |
| 4 | Thread ledger | Suggests setups and questions; tracks only those the author confirms. | Authors find aging/status views useful without feeling accused. |

> **MVP boundary:** Phase 1 is the first production candidate. Phases 2–4 should reuse its evidence, review-state, disposition, and incremental-analysis primitives, but they are not required to validate wiki freshness.

## 5. Primary user experience

### 5.1 Trigger

The first scan is offered after the author saves a meaningful chapter revision and generates or refreshes the chapter summary. The author explicitly starts the AI operation. A later setting may enable a bundled “summary + continuity scan” action, but background manuscript uploads are out of scope.

### 5.2 Chapter results panel

After analysis, the chapter screen displays a compact summary such as: “3 new facts about existing characters · 1 possible canon conflict · 2 wiki pages may be outdated.” Items are grouped by entity, ordered by expected value, and collapsed when confidence is low.

Each item contains:

- A neutral label and one-sentence explanation.

- The exact new passage, chapter title, and revision reference.

- The compared wiki passage, approved fact, or rule when applicable.

- An interpretation selector when temporal or narrative context matters.

- One-click decisions and a path to inspect the full page or chapter.

### 5.3 MVP decisions

| Action | Effect |
| --- | --- |
| Add to wiki | Proposes an appended or merged update; author previews and confirms the final text. |
| Replace old canon | Marks the prior fact as superseded and proposes replacement text. |
| Temporary state | Records that both observations may be true over different intervals. |
| Intentional contradiction | Dismisses the item and stores a scoped explanation to prevent repetition. |
| Ignore this suggestion | Dismisses this item; optional pattern feedback may suppress similar results. |

### 5.4 Example warning language

> **Possible continuity conflict:** Mara’s eyes are described as blue in Chapter 2 and black in Chapter 19. Is this change intentional? Show both passages · Temporary state · Intentional contradiction · Update canon · Dismiss

## 6. Domain model

Do not collapse the system into generic subject–relationship–object edges. The UI and evaluation logic require three first-class object families plus evidence, dispositions, and review state.

### 6.1 Observed facts

A claim extracted from prose or a structured summary. It is evidence, not canon. Required fields include subject/entity, predicate, object or value, source chapter and revision, exact quotation and offsets, confidence, temporal qualifiers, assertion mode, and extraction model/version.

### 6.2 Author-approved canon facts and rules

Canon facts are explicit author-approved statements associated with wiki pages. Rule cards describe invariants that should hold across the story and may include structured exceptions and a free-form author interpretation note. Rules should be few, important, and directly editable.

### 6.3 Narrative threads

Threads represent setups, promises, mysteries, obligations, or unanswered questions. A machine suggestion becomes an official thread only after author confirmation. Threads record introduction evidence, later touches, planned status, resolution evidence, and optional target timing.

### 6.4 Assertion and canon states

| State | Meaning | Comparison behavior |
| --- | --- | --- |
| Author-approved canon | Accepted reference truth. | Eligible baseline for conflict checks. |
| Observed prose claim | Model-extracted statement from text. | Compared but never promoted automatically. |
| Narrator assertion | Statement made by narrative voice. | Weighted by narrator reliability metadata if available. |
| Character belief | Belief, perception, or dialogue claim. | Excluded from hard conflict checks by default. |
| Rumor or lie | Known untrustworthy in-story statement. | Retained as evidence but normally suppressed. |
| Temporary state | Fact valid over a bounded or unknown interval. | Conflicts only when intervals overlap. |
| Superseded canon | Former canon replaced by later author decision. | Shown for history, not used as current baseline. |

## 7. System design

### 7.1 Incremental analysis flow

1. Capture the saved chapter revision and compute a stable content hash.

1. Determine the delta from the last analyzed revision; if unavailable, analyze the complete current chapter once.

1. Resolve relevant wiki pages through explicit chapter links, summary entities, aliases, and high-confidence entity mentions.

1. Build a bounded prompt from the changed passage, structured chapter summary, relevant approved canon, active rules, and prior author dispositions.

1. Request structured candidate evidence and comparisons from the model.

1. Validate citations against the exact supplied text, deduplicate candidates, and apply deterministic suppression rules.

1. Persist results as pending suggestions and show only items above the release threshold.

1. Apply the author’s decision, update review state, and reuse that feedback in later scans.

### 7.2 Relevance retrieval

Retrieval should be deterministic before it is semantic. Start with manually linked wiki pages and existing AI-summary links, then match canonical names and aliases in changed text, then use summary entities. Embedding or graph traversal is optional later optimization; it is not required for the MVP.

### 7.3 Candidate pipeline

The model proposes structured candidates; application code decides whether they are displayable. A candidate must have valid evidence spans, a recognized entity, an allowed assertion mode, and a comparison target. The app then removes duplicates, known dismissed patterns, same-revision repeats, and candidates below confidence thresholds.

### 7.4 Full-manuscript audit

A whole-book scan may be added later as an explicit, cost-previewed operation. It should checkpoint by chapter, resume after interruption, and write results into the same suggestion model. It must not be the default path for routine edits.

## 8. Persistence design

The current SQLite model already contains chapter revisions, chapter summaries, wiki pages, chapter–wiki links, wiki update history, and wiki review state keyed by wiki page, chapter, and chapter content hash. Preserve those tables and add small, purpose-specific tables rather than a generalized graph store.

| Proposed table | Purpose | Key fields |
| --- | --- | --- |
| canon_facts | Author-approved atomic facts associated with a wiki page. | id, book_id, wiki_page_id, subject, predicate, value_json, temporal_json, status, note, timestamps |
| canon_rules | Author-authored laws and interpretation guidance. | id, book_id, title, rule_text, structured_rule_json, enabled, priority, note, timestamps |
| canon_rule_exceptions | Exceptions scoped to a rule. | id, rule_id, exception_text, structured_exception_json, enabled |
| continuity_evidence | Immutable extracted claims with verifiable source spans. | id, book_id, chapter_id, revision_id, quote, offsets, assertion_mode, claim_json, confidence, extractor_version |
| continuity_suggestions | Reviewable comparisons or freshness findings. | id, kind, evidence_id, target_type/id, status, score, rationale, fingerprint, created_at |
| continuity_dispositions | Author decision and suppression scope. | id, suggestion_id, action, reason, suppression_key, actor, created_at |
| narrative_threads | Author-confirmed setup/question lifecycle. | id, book_id, title, status, introduced_evidence_id, planned_note, resolved_evidence_id, timestamps |
| thread_touches | Later references to confirmed threads. | id, thread_id, evidence_id, touch_type, confidence, confirmed |
| continuity_scan_runs | Reproducibility, progress, and cost metadata. | id, book_id, chapter_id, revision_id, mode, prompt/model version, status, token counts, timestamps |

### 8.1 Compatibility and backup requirements

- Add migrations through the existing schema setup path and indexes for chapter/revision, wiki page, suggestion status, fingerprint, and rule lookup.

- Include all new tables in canonical bundle export, import, validation, logical dump, snapshot, and deletion flows.

- Use portable stable IDs and preserve unknown forward-compatible fields where the bundle format requires it.

- Deleting a chapter, wiki page, or book must cascade or explicitly clean related evidence, review state, suggestions, and thread references without orphaning records.

## 9. AI and prompt contract

### 9.1 Input contract

Each request should contain only the selected changed text, source metadata, relevant structured summary, relevant wiki/canon excerpts, active rules and exceptions, and compact suppression guidance derived from prior dispositions. The prompt must distinguish prose evidence from author-approved canon.

### 9.2 Output contract

Require strict structured output. Each candidate includes kind, entity references, normalized claim, assertion mode, temporal qualifiers, exact quote, start/end offsets, comparison target, neutral rationale, confidence, and any ambiguity flags. Reject or quarantine candidates whose quotes cannot be found verbatim in the provided input.

### 9.3 Warning policy

- Never use the word “error” unless a deterministic invariant is violated and the author has configured that severity.

- Treat dialogue, beliefs, rumors, figurative language, and uncertain narration as non-canonical unless the author promotes them.

- Prefer one consolidated suggestion over several variants of the same claim.

- Do not create a durable suggestion below the display threshold; retain aggregate telemetry locally if needed for tuning.

- Store model and prompt versions so results can be audited and regenerated.

## 10. Detailed feature requirements

### 10.1 Wiki freshness (MVP)

- For a linked wiki page, identify chapter content added or changed since that page–chapter pair was last reviewed.

- Display new evidence even when it does not conflict with existing page text.

- Allow the author to mark the page current for that exact chapter content hash.

- If the chapter later changes, automatically treat the prior review state as stale.

- Generate wiki edits only as previews; preserve manual text and require confirmation.

- Support “no relevant change” so review can be completed without editing the page.

### 10.2 Canon conflicts

- Compare observed facts with current author-approved canon facts, not arbitrary prior prose claims by default.

- Show both exact passages and relevant temporal qualifiers.

- Support dispositions for temporary state, transformation, disguise, mistaken observation, metaphor, unreliable narration, intentional contradiction, superseded canon, and incorrect extraction.

- Use dispositions to prevent semantically equivalent warnings from recurring within a configurable scope.

### 10.3 Rule cards

- Allow a concise natural-language rule, optional structured fields, importance, scope, and author note.

- Allow multiple exceptions with explicit scope and enable/disable state.

- Check only enabled rules relevant to the changed chapter.

- Cite the rule, exception considered, and triggering prose; ask whether the event is permitted or intentional.

### 10.4 Thread ledger

- Suggest potential setups or questions but require confirmation before tracking.

- Support statuses: candidate, open, planned payoff, resolved, intentionally abandoned, and not a thread.

- Show last-touched chapter and elapsed chapters without declaring a problem.

- Let the author attach a private plan and mark a resolution from exact evidence.

## 11. Trust, privacy, and safety

- No background AI calls. The author initiates analysis and can inspect the context that will be sent.

- Send the minimum relevant content directly from the client using the user-configured API key, matching beta bot’s local-first architecture.

- Keep manuscripts, evidence, suggestions, and dispositions in local SQLite and include them only in user-initiated encrypted backups.

- Never overwrite wiki content or approved canon without an explicit preview and confirmation step.

- Provide a per-book switch to disable continuity features and a deletion action for generated evidence/results.

- Treat extracted claims and scores as fallible model output in UI language and documentation.

## 12. Evaluation plan

### 12.1 Concierge prototype on Life Balance

1. Define 5–10 important cosmology rules and their known exceptions manually.

1. Select approximately 15 representative chapters, including known tricky cases and intentional contradictions.

1. Run evidence extraction and proposed-warning generation outside the production workflow while preserving exact prompts and outputs.

1. Grade each result as useful, technically true but useless, incorrect, or actively distracting.

1. Record review time, author decision, duplicate status, citation validity, and whether the item revealed something genuinely forgotten.

1. Repeat selected scans after adding author dispositions to measure whether the system learns the intended interpretation.

### 12.2 Metrics

| Metric | Definition | Target direction |
| --- | --- | --- |
| Worth-reading rate | Useful + technically true/useful-enough items divided by displayed items. | High; primary precision measure |
| Citation validity | Displayed candidates whose quotations and locations resolve exactly. | Near 100% |
| Action rate | Displayed items receiving a canon/wiki/thread action rather than dismissal. | Increase by phase |
| Review time | Median time from opening an item to a final disposition. | Lower than manual checking |
| Repeat-warning rate | Dismissed intent resurfacing after feedback. | Declines across rescans |
| Material-find rate | Scans that reveal at least one issue or stale page the author cares about. | Non-trivial and repeatable |
| Token cost | Input/output tokens per changed 1,000 words and per accepted item. | Bounded and predictable |

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| False positives | Authors stop trusting or using the feature. | High display threshold, neutral language, assertion modes, exact evidence, deduplication, and learned suppression. |
| False certainty | Intentional ambiguity is mislabeled as an error. | Questions rather than verdicts; author-owned canon and temporal classifications. |
| Context bloat | High cost, latency, or irrelevant comparisons. | Deterministic retrieval, chapter deltas, scoped canon, explicit whole-book audits. |
| Automatic-edit damage | Manual wiki prose or nuance is lost. | Previewed patches only; no silent updates; retain history. |
| Schema overreach | A graph migration delays validation. | Purpose-specific tables and JSON for evolving claim structure. |
| Thread anxiety | Aging threads feel like accusations or productivity debt. | Ledger language, confirmation before tracking, no dropped-thread score. |
| Cross-platform drift | Data fails to survive browser/Electron/Android backup and restore. | Update bundle schemas, fixtures, validation, and platform tests with each new table. |

## 14. Delivery plan and acceptance criteria

### 14.1 Prototype

- Concierge evaluation corpus and grading rubric exist.

- All surfaced items have validated exact citations.

- Results include wiki freshness and at least one explicit-rule pass.

- Go/no-go decision is based on worth-reading rate, review time, material finds, and repeat-warning behavior.

### 14.2 MVP engineering slice

- A saved chapter revision can be scanned on explicit user action.

- The scan retrieves relevant linked wiki pages and compares content since their last reviewed chapter hash.

- Results show exact chapter evidence and page context with Add, Replace, Temporary, Intentional, Ignore, and No relevant change actions as applicable.

- Wiki modifications are previewed and confirmed; history remains recoverable.

- Review state becomes stale when chapter content changes.

- New records round-trip through local persistence, deletion, import/export, canonical bundles, and encrypted backup restore.

- Unit/component coverage meets the repository quality gate; browser, Electron, and Android-sensitive persistence paths have appropriate tests.

## 15. Open questions

- Should approved canon facts be maintained as atomic records, or initially derived from selected wiki passages with author confirmation?

- What minimum revision size should trigger a scan suggestion, and how should non-contiguous edits be excerpted?

- Should the first release analyze characters and locations only, or include concept pages where world rules often live?

- What suppression scope is safest: exact fingerprint, entity/predicate pair, chapter, book, or author-selected pattern?

- Which model and structured-output strategy provide acceptable citation fidelity, latency, and cost on target manuscript sizes?

- How should a full-book audit communicate estimated tokens and progress before the author starts it?

## 16. Recommended decision

> **Recommendation:** Approve a bounded prototype and Phase 1 design. Do not approve a general knowledge-graph initiative. Validate whether writers value cited wiki-freshness and rule-checking results before investing in broader canon extraction, graph visualization, or automatic thread detection.

If the prototype passes the stated quality bar, implement wiki freshness as the first production capability using the existing revision, summary, wiki-link, wiki-history, and review-state foundations. Treat canon conflicts, rule cards, and the thread ledger as separately gated follow-on slices.

### Immediate next actions

- Approve the concierge prototype scope and name the decision owner.

- Select the 15-chapter Life Balance corpus and document known tricky cases before running the model.

- Create the grading sheet and capture prompts, citations, dispositions, review time, and token cost for every result.

- Hold a go/no-go review after the first pass and one feedback-informed rescan; proceed to MVP implementation only if the quality bar is met.
