# ListingPilot intelligence foundation

## Architecture

The domain pipeline is:

`Source input → ProductNormalizer → NormalizedProduct[] → IntelligenceContext → pack resolution → DetectorRunner → IntelligenceIssue[] → duplicate suppression → RecommendationEngine → confidence evaluation → IntelligenceReport`

Source adapters own source-specific conversion. The engine accepts only normalized products and supplied evidence. It does not fetch data or persist reports.

## Model responsibilities

- `NormalizedProduct`, `NormalizedVariant`, `NormalizedMedia`, `NormalizedSpecification`, and `NormalizedSeo` describe source-independent catalog data.
- `SourceReference` records generic external identity and provenance.
- `Evidence` records claims and reliability; evidence is input to analysis and is not automatically treated as truth.
- `IntelligenceIssue` describes an explainable detector finding.
- `IntelligenceRecommendation` traces proposed actions back to issues.
- `IntelligenceContext` is the immutable input for every detector.
- `IntelligenceReport` is the immutable, versioned output.

Factories validate and detach domain input before recursively freezing it. Prices remain exact decimal strings.

## Detector lifecycle

1. Explicitly instantiate a `DetectorRegistry`.
2. Register detectors with stable IDs, versions, scopes, requirements, priority, timeout, and deterministic metadata.
3. The runner resolves eligibility and executes detectors sequentially in priority/ID order.
4. Expected analysis problems should be returned as warnings or typed detector failures.
5. Timeout, cancellation, and failures are isolated unless fail-fast is enabled.

Parallel-safe metadata exists for a future runner, but Sprint 7.1 intentionally executes sequentially.

## Knowledge and capability packs

Knowledge Packs hold category vocabulary and metadata. Capability Packs describe reusable analysis abilities. They have separate registries and identities because category knowledge and engine capability are independent concerns. Both registries validate dependencies, expose versions, support enable/disable, and return deterministic snapshots.

Sprint 7.2 includes the source-independent `deterministic-quality` Capability
Pack. It has no Knowledge Pack dependency and supplies the deterministic rule
detectors described below.

## Evidence providers

Evidence Provider definitions are metadata-only. They declare supported source types, claims, reliability, and compatibility. Providers do not retrieve evidence in the intelligence domain. Callers supply already collected `Evidence` in the context.

## Issue fingerprinting and duplicate suppression

Fingerprints use issue code, semantic detector identity, scope, sorted affected products/variants/fields, and normalized evidence claims. Titles alone never establish identity.

Within a duplicate group, the highest-severity issue is canonical. Evidence is merged and ordered by reliability, freshness, priority, then ID. Originating issue and detector IDs remain in metadata. Original issues are never mutated.

## Recommendation lifecycle

Recommendation strategies are explicitly registered and deterministically ordered. A strategy may return zero or many recommendations and may consolidate multiple issues. Equivalent recommendations are merged while issue and strategy traceability is preserved.

## Confidence

The confidence contract accepts evidence weights, detector/rule weights, official-source weight, merchant override, freshness, and disagreement. The neutral implementation returns a validated neutral value (or an explicit merchant override) and records supplied factors without pretending to implement a production formula.

## Analysis scopes

`IntelligenceEngine.analyze` supports `SINGLE_PRODUCT`, `SELECTED_PRODUCTS`, and `FULL_CATALOG` through one interface. Scope validation happens before detector execution.

## Non-production extension example

```ts
import {
  DetectorRegistry,
  IntelligenceEngine,
  type IntelligenceDetector,
} from '@/modules/intelligence';

const detector: IntelligenceDetector = {
  metadata: {
    id: 'example.generic',
    displayName: 'Generic example',
    version: '1.0.0',
    description: 'Demonstrates registration only.',
    issueCategories: ['DATA_QUALITY'],
    supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
    requiredCapabilities: [],
    priority: 100,
    timeoutMs: 1_000,
    parallelSafe: true,
    enabled: true,
    deterministic: true,
  },
  execute: () => ({ issues: [], warnings: [], metrics: {}, metadata: {} }),
};

const detectors = new DetectorRegistry();
detectors.register(detector);
// Pass `detectors` and the other explicit registries/services to IntelligenceEngine.
// Then call `engine.analyze(normalizedContext)`.
void IntelligenceEngine;
```

## Deterministic rule engine

`createDeterministicRuleBundle` is the production composition point for the
Sprint 7.2 rule layer. The caller explicitly supplies a hasher and may supply a
validated configuration or rule registry. The bundle provides:

- the versioned `deterministic-quality` Capability Pack;
- a registry containing 49 independently enabled, versioned rules;
- eight sequential-safe detectors for identity, descriptions, variants, media,
  SEO, specifications, tags, and catalog duplicates; and
- a recommendation strategy that creates actionable, non-generated guidance
  with full issue and rule traceability.

Every rule has a stable rule ID and issue code, explicit severity policy,
affected fields, explanation and recommendation templates, supported scopes,
and optional configuration key. Rule findings use the existing issue
fingerprinting and duplicate-suppression pipeline. Confidence is intentionally
high but never absolute and records a deterministic rule-match factor.

Duplicate checks group normalized values in maps. Catalog-wide checks operate
only on the products supplied in the selected analysis scope; they do not query
or persist catalog data. Text, description, media URL, threshold, and
case-sensitivity behavior is controlled by an immutable validated
`DeterministicRuleConfiguration`.

`evaluateRuleQualityStatus` maps the resulting issues to `PASS`,
`PASS_WITH_WARNINGS`, or `FAIL`. Its default failure threshold is `HIGH`; the
function reports the applied threshold and severity counts without mutating the
report.

## Product Truth Engine

`createProductTruthBundle` is the production composition point for the
source-independent `product-truth` Capability Pack, version `1.0.0`. The bundle
contains immutable configuration, claim-extractor and resolution-strategy
registries, generic comparison and Product Truth confidence strategies, one
existing-framework detector, a recommendation strategy, and the pure
`ProductTruthAnalyzer`.

The analysis flow is:

`NormalizedProduct + supplied Evidence -> ProductClaim -> TruthClaimGroup -> TruthCandidate -> evidence evaluation -> TruthResolution -> TruthFinding -> IntelligenceIssue/IntelligenceRecommendation -> IntelligenceReport`

The Product Truth detector stores its typed `ProductTruthReport` in its
detector-execution metadata. `getProductTruthReport` retrieves that extension
from an `IntelligenceReport`; issues and recommendations still travel through
the standard detector, suppression, confidence, and recommendation pipeline.

### Claims, groups, and candidates

Claim extractors read structured normalized fields and structured supplied
evidence only. They cover generic product, SEO, specification, variant,
variant-option, media, and attribute fields. They do not interpret descriptive
sentences as facts.

Group identity uses product ID, optional variant ID, namespace, normalized key,
and affected field path. Display labels never establish identity. Grouping and
source deduplication use maps and preserve every original claim and evidence
reference.

Candidate normalization supports strings, booleans, exact integers and
decimals, dates already supplied in normalized form, explicit unordered lists,
objects, unknown values, aliases, and canonical units supplied through
configuration. It performs no fuzzy matching. For example, `120`, `120Hz`, and
`120 Hz` are not considered equivalent unless explicit unit or alias metadata
supports that conclusion. Incompatible units are `INCOMPARABLE` and remain
unresolved.

### Evidence and source precedence

Evidence is never fetched by this module. The default authority direction is:

1. explicit merchant-approved override;
2. structured manufacturer evidence;
3. manufacturer documentation;
4. authoritative distributor data;
5. structured retailer data;
6. merchant listing data;
7. human-reviewed evidence;
8. AI-derived interpretation;
9. unknown evidence.

Authority influences a resolution but never decides it by itself. The
evaluation also records reliability, freshness, directness, structured status,
independent-source diversity, disagreement, provenance completeness, and
duplicate-source handling. Evidence sharing one provider/source identity is
conservatively counted once for diversity. AI-derived-only evidence and the
current merchant listing alone cannot produce `VERIFIED`; missing provenance
applies a configurable confidence ceiling.

All weights, thresholds, ceilings, source policies, unit/value aliases, field
importance defaults, and blocking importance levels are validated and deeply
immutable.

### Resolution statuses and strategies

Resolution strategies run in explicit deterministic order:

1. explicit not-applicable marker;
2. merchant-approved override;
3. insufficient evidence;
4. exact consensus;
5. material conflict;
6. authority-weighted consensus;
7. unresolved fallback.

`VERIFIED` requires strong traceable support, the configured minimum independent
evidence, and no material unresolved conflict. `LIKELY` selects a preferable
candidate without claiming verification. `CONFLICTED` never exposes a selected
truth value. `UNRESOLVED` preserves candidates when comparison or support is
unsafe. `INSUFFICIENT_EVIDENCE` fabricates neither candidates nor values.
`MERCHANT_OVERRIDE` remains visibly marked and retains conflicting evidence.
`NOT_APPLICABLE` requires explicit structured metadata.

Confidence on `VERIFIED`, `LIKELY`, and `MERCHANT_OVERRIDE` describes the
selected candidate. Confidence on `CONFLICTED`, `UNRESOLVED`,
`INSUFFICIENT_EVIDENCE`, and `NOT_APPLICABLE` describes confidence in the
resolution status—not confidence that one candidate is true. Every confidence
result includes bounded, named factors.

Product Truth emits attention issues only for conflicts, unresolved important
claims, insufficient evidence, missing provenance, low-confidence resolutions,
and conflicted overrides. Verified claims remain findings without unnecessary
issues. Recommendations require merchant approval and never propose or
overwrite a factual value.

`evaluateProductTruthQualityStatus` produces `TRUSTED`,
`REVIEW_RECOMMENDED`, `REVIEW_REQUIRED`, `BLOCKED`, or `NO_EVIDENCE` without
integrating the result into publishing.

### Non-production evidence example

Suppose structured evidence for one generic measurement says:

- Samsung Official: `120 Hz`
- Retailer A: `144 Hz`
- Retailer B: `120 Hz`

The engine groups these claims using their structured product, namespace, key,
and field identity. It creates candidates for `120|hz` and `144|hz`, deduplicates
source identities, applies configured authority and evidence factors, retains
the retailer disagreement, and selects a status through the versioned
resolution policy. The example does not give Samsung or any retailer a
brand-specific rule; different weights or insufficient provenance may produce
`LIKELY`, `CONFLICTED`, or `UNRESOLVED`.

### Relationship to deterministic quality

`deterministic-quality` identifies objective field-quality failures such as a
missing specification. `product-truth` evaluates whether supplied sources agree
on a structured claim value. They have distinct capability, detector, issue,
and recommendation identities and may run independently or together.

Future Knowledge Packs may contribute aliases, canonical keys, units,
comparison strategies, importance, authority adjustments, evidence
requirements, and category-specific resolution policies. Product Truth has no
mandatory production Knowledge Pack.

The core loops are approximately O(claims + evidence + candidates), plus
deterministic sorting where stable output requires it. There are no global
mutable caches or catalog-wide pairwise comparisons.

## AI Detective

`createAIDetectiveBundle` composes the `ai-detective` Capability Pack version
`1.0.0`. The capability depends on `product-truth`; its detectors always run
after `product-truth.analysis` and consume the exact immutable
`ProductTruthReport` produced during the same Intelligence Engine execution.
The caller registers Product Truth before AI Detective in the capability
registry. The deterministic quality capability remains independently optional.

The detector flow is:

`Product Truth report + normalized fields -> contradiction rules -> Contradiction -> DetectiveFinding -> IntelligenceIssue -> merchant-review recommendation -> DetectiveReport metadata`

Completed detector metadata is passed to later detectors through an
execution-local immutable context extension. It is not written back to the
caller's context and does not use a global cache. Failed detector output is not
exposed downstream.

### Contradiction and explanation model

A `Contradiction` has a stable ID and fingerprint, primary and affected
product/variant identities, a generic contradiction type, severity,
explainable confidence, involved claim references, Product Truth finding IDs,
evidence IDs, rule identity/version, recommendation IDs, and extension
metadata. A `DetectiveFinding` adds merchant-facing state and review
requirements. A `DetectiveReport` contains deterministic ordering, complete
severity/type counts, blocked products, review counts, and a fingerprint.

The built-in generic categories are:

- `VALUE_CONFLICT`
- `DUPLICATE_IDENTITY`
- `IMPOSSIBLE_COMBINATION`
- `SUSPICIOUS_COMBINATION`
- `WEAK_EVIDENCE`
- `TRUTH_LISTING_MISMATCH`

Value, override, and listing contradictions trace back to Product Truth
findings and their supplied evidence. Identity and combination contradictions
trace back to explicit normalized fields. The issue metadata repeats the rule,
claim, finding, evidence, and merchant-impact traceability needed by
Intelligence Report consumers. Existing Product Truth issues are not copied or
renamed.

### Rules, confidence, and configuration

`ContradictionRuleRegistry` owns immutable versioned rules and independent
enable state. Explanation and recommendation text belongs to rules, not
detectors. Impossible and suspicious combinations use two declarative fact
conditions over Product Truth or normalized fields; no product-category logic
is built into their evaluator. Future Knowledge Packs can register
category-specific combination rules.

Confidence uses the Sprint 7.1 contract and records three named factors:
deterministic contradiction certainty, involved Product Truth strength, and
evidence/provenance quality. Values are bounded below absolute certainty.
Immutable configuration controls enabled types, minimum severity, per-type
severity overrides and confidence thresholds, blocking types, listing truth
statuses, and duplicate identity fields.

Recommendations are verification guidance only. They require merchant approval,
are `SUGGEST_ONLY`, and contain no generated or proposed factual replacement.
`evaluateDetectiveQualityStatus` returns `CLEAR`, `REVIEW_RECOMMENDED`,
`REVIEW_REQUIRED`, or `BLOCKED` without changing publishing behavior.

### Extension and future AI integration

Each contradiction-producing detector emits an
`aiDetectiveContradictions` metadata fragment. The final report detector merges
these fragments by contradiction ID. A future Sprint 8 LLM detector can
produce additional validated contradiction fragments before the report
detector; it does not replace or alter deterministic detectors. Such a detector
must reference Product Truth findings or deterministic product fields and must
not invent facts.

Duplicate SKU/barcode detection uses normalized-value maps. Listing comparison
indexes products by ID. The core catalog paths avoid pairwise product scans and
support thousands of products and findings, with sorting only for stable output.
The module imports no Prisma, Shopify, React, Next.js, OpenAI, API, persistence,
or network code.

## Recommendation Intelligence

`createRecommendationIntelligenceBundle` composes the
`recommendation-intelligence` Capability Pack version `1.0.0`. It depends on
`deterministic-quality`, `product-truth`, and `ai-detective`. The capability
does not replace their recommendation strategies. It consumes the final
duplicate-suppressed issues and existing recommendations after confidence has
been attached, then contributes a typed `RecommendationPlan` to
`IntelligenceReport.metadata.recommendationPlan`.

The execution flow is:

`Issues + upstream recommendations + Product Truth/Detective traceability -> declarative recommendation rules -> impact and merchant-effort estimates -> dependency graph -> deterministic priority -> groups -> structured summary -> RecommendationPlan`

The generic optional `IntelligenceReportContributor` extension point runs only
after normal recommendation generation. Engines without contributors preserve
the previous report shape and fingerprint inputs. A contributor is explicitly
registered and writes one namespaced metadata key; duplicate keys fail closed.

### Recommendation model and explainability

A planned `Recommendation` contains a stable ID and fingerprint, generic
category, title, explanation, source severity, numeric execution priority,
appropriateness confidence, impact, merchant effort, blocking status,
dependencies, related issue IDs, Product Truth finding IDs, AI Detective
contradiction IDs, affected products/fields, and rule metadata.

Every item records:

- the declarative recommendation rule and version;
- source recommendation IDs;
- priority score and named priority factors;
- the reason for merchant action;
- confidence meaning `RECOMMENDATION_APPROPRIATENESS`; and
- deterministic traceability to upstream output.

It does not contain generated factual values and does not mutate products.

### Rules, impact, effort, and priority

`RecommendationRuleRegistry` owns stable versioned rule definitions with
declarative matching, category, priority policy, impact policy, effort policy,
blocking policy, dependency categories, and templates. The generic categories
are data completeness, Product Truth, contradiction, SEO, media, identity,
variants, catalog, and publishing readiness.

Impact is `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`. It combines the rule's
severity-to-impact policy, existing deterministic recommendation impact, and
structured business importance when present. Effort is merchant effort—not
software effort—and is `TRIVIAL`, `SMALL`, `MEDIUM`, or `LARGE`. It combines
the rule default, affected-field thresholds, and existing recommendation
effort.

Priority is numeric from 1 through 5. Its score records contributions from
source severity, rule base score, blocking status, recommendation
appropriateness confidence, structured business importance, and the number of
dependent actions unlocked. Thresholds are immutable configuration. No random
or time-dependent value participates.

Appropriateness confidence reuses the Sprint 7.1 confidence contract. Its
factors are rule applicability, upstream recommendation support, and
traceability completeness. It represents confidence that the action is
appropriate, not confidence that an underlying product claim is true.

### Dependency graph, blockers, and execution order

Rules declare prerequisite recommendation categories. The graph selects one
deterministic prerequisite anchor per category and product using maps, preferring
explicit blockers, higher priority seeds, and stable IDs. Catalog-scoped
anchors may apply to their affected products. Unrelated products are never
linked.

Topological ordering guarantees prerequisites execute before dependents.
Independent items use priority, impact, and stable ID ordering. Cycles fail
closed. Items that explicitly block publication or unlock dependent work are
`BLOCKER`; items awaiting prerequisites are `BLOCKED`.

### Groups, quick wins, and summaries

Grouping policies provide stable group IDs, names, descriptions, and order.
Groups aggregate impact, merchant effort, and external completion
dependencies. A quick win is configurable but defaults to high-or-critical
impact, small-or-trivial effort, no unmet dependency, and non-blocker status.
Long-term improvements use a configurable minimum effort.

The summary is structured data only: blocker count, quick-win count,
recommendation count, group count, total merchant effort, and publishing
readiness (`READY`, `REVIEW_RECOMMENDED`, `REVIEW_REQUIRED`, or `BLOCKED`).
`evaluateRecommendationPlanQuality` exposes the same readiness boundary without
publishing or modifying anything.

Configuration controls enabled categories, minimum included impact, priority
thresholds, field-count effort thresholds, blocker policies, quick-win policy,
long-term effort, and every grouping policy. Configuration and all plan output
are deeply immutable.

Issue-to-recommendation and recommendation-to-group lookups use maps. Dependency
construction and topological ordering are O(recommendations + dependency
edges), plus deterministic sorting. Performance tests cover thousands of
products, issues, recommendations, and product-local dependencies without
pairwise catalog scans.

The module imports no Prisma, Shopify, React, Next.js, OpenAI, API, persistence,
or network code. UI, persistence, product mutation, publication, and generated
content remain outside this capability.

## Catalog Health

`createCatalogHealthBundle` composes the `catalog-health` Capability Pack
version `1.0.0`. Its explicit dependencies are `deterministic-quality`,
`product-truth`, `ai-detective`, and `recommendation-intelligence`. It is the
final deterministic aggregation layer in the Sprint 7 pipeline:

`normalized catalog + final issues + Product Truth report + Detective report + Recommendation Plan -> product health -> dimensions -> catalog problems/segments -> focus areas -> CatalogHealthReport`

The capability never re-runs an upstream detector. Its report contributor runs
after Recommendation Intelligence and reads the immutable prior
`recommendationPlan` contribution. It writes
`IntelligenceReport.metadata.catalogHealth`; `getCatalogHealthReport` is the
typed accessor. When the contributor is absent or disabled, the previous
report shape and fingerprint behavior remain unchanged.

### Health score and assessment confidence

Health score and assessment confidence answer different questions:

- Health score (0-100) describes the quality and readiness signals that were
  actually observed.
- Assessment confidence (0-100) describes whether enough complete,
  well-provenanced upstream analysis exists to trust that score.

A high-looking score with low confidence is valid. Missing required upstream
output or insufficient confidence takes precedence over positive health
language and produces `INSUFFICIENT_ANALYSIS`.

The catalog score is decomposable:

`weighted enabled dimensions - blocker penalty - critical-risk penalty - incomplete-analysis penalty`

All components are visible in `scoreExplanation`, and the final value is
bounded to 0-100. Default weights total 100: Product Truth 20, data completeness
15, consistency 15, identity 10, specifications 10, variants 10, SEO 8, media
7, and pricing 5. Publishing readiness is reported separately to avoid
double-counting. Disabling a dimension requires either weights that still total
100 or explicit `normalizeEnabledWeights`; redistribution is never hidden.

Grades default to A (90-100), B (80-89.99), C (70-79.99), D (60-69.99), and F
(0-59.99). Merchant-facing statuses are independently configurable:
`EXCELLENT`, `HEALTHY`, `NEEDS_ATTENTION`, `POOR`, `CRITICAL`, and
`INSUFFICIENT_ANALYSIS`.

### Product health and anti-double-counting

Every normalized product receives an immutable `ProductHealthSummary` before
catalog aggregation. It includes score, grade, status, publishing readiness,
confidence, issue and contradiction counts, Product Truth quality, blockers,
quick wins, recommendation traceability, affected dimensions, top problems,
and safe normalized external identity fields.

Issue penalties are applied once per stable canonical root-cause family per
product. The default identity precedence is Product Truth claim group, AI
Detective contradiction, semantic detector identity, rule identity, then
detector/code. Within one family only the strongest applicable penalty is used.
Consequently, one missing title that also affects SEO and readiness does not
receive three full penalties. Product Truth findings use the same claim-group
identity as their related issues.

### Dimensions, readiness, coverage, and confidence

Generic dimensions are identity, data completeness, Product Truth,
consistency, SEO, media, variants, pricing, specifications, catalog integrity,
and publishing readiness. The default weighted set excludes the last two.
Each emitted `HealthDimension` reports score, grade, status, confidence,
evaluated and affected products, affected percentage, blockers, severity
counts, recommendation count, explanation factors, and a fingerprint.

Catalog Health consumes existing readiness and blocker signals; it does not
create a competing publication gate. The summary states are `READY`,
`READY_WITH_WARNINGS`, `REVIEW_RECOMMENDED`, `REVIEW_REQUIRED`, `BLOCKED`, and
`UNKNOWN`, with blocked taking precedence. Counts, percentages, publish-ready
percentage, blocked percentage, and unknown count are reported.

`CatalogCoverageSummary` exposes supplied and normalized products, per-capability
analysis counts, Product Truth findings, evidence and provenance coverage,
Detective and Recommendation Plan coverage, exclusions, completeness, missing
capabilities, and confidence impact. Assessment confidence combines these
coverage signals using explicit immutable weights. Missing analysis is never
treated as healthy.

### Problems, segments, and concentration

Catalog problems aggregate issues and contradictions by stable canonical
identity, never display text. Ranking uses configured contributions from
affected-product percentage, severity, blockers, recommendation impact,
confidence, recurrence, and concentration. Each problem preserves related
issue, contradiction, and recommendation IDs and a bounded, stable
representative-product sample.

Optional segment policies support vendor, product type, supplied category,
status, source, and one explicitly named primitive metadata field. Grouping is
deterministic, handles missing labels, enforces minimum size, and stops at a
configured global segment cardinality. Segment summaries include health,
readiness, blockers, review counts, top canonical issue families, and
recommendation categories.

Concentration is deterministic distribution analysis, not causal inference.
A problem may be catalog-wide, segment-concentrated, isolated, or distributed.
Catalog-wide affected percentage, segment share, and isolated-product
thresholds are configurable.

### Priority focus areas

Focus areas are built only from the existing Recommendation Plan. They group
traceable recommendation IDs, retain Recommendation Intelligence priority,
impact, merchant effort, dependency order, and blocker status, and reference
related catalog problems. Blockers rank first. Quick-win inclusion and maximum
focus-area count are configurable. Every focus area requires merchant approval
and cannot execute, modify, or publish anything.

### Configuration, determinism, and performance

Configuration is validated and deeply immutable. Validation rejects negative
weights, implicit invalid totals, duplicate/unsupported dimensions or segment
types, malformed metadata policies, overlapping grade/status thresholds,
invalid percentages, invalid ranges, unsupported readiness mappings, empty
canonical identity keys, and impossible limits.

All IDs and fingerprints use stable inputs. Product, issue, finding,
recommendation, problem, segment, and focus-area ordering is deterministic.
Generated time is retained as execution metadata but excluded from fingerprints.
Reordering equivalent products, issues, recommendations, or segment input does
not change the report fingerprint.

The expected aggregation complexity is approximately
O(products + issues + findings + contradictions + recommendations), plus
bounded deterministic sorting. Product-indexed maps, canonical problem maps,
bounded segment cardinality, and bounded representative samples avoid pairwise
catalog scans and unbounded output. The performance fixture covers 10,000
products, 30,000 issues, 10,000 Product Truth findings, 5,000 contradictions,
and 20,000 recommendations.

### Structured example

```text
Catalog Health: 84 / 100
Grade: B
Status: HEALTHY
Assessment Confidence: 93
Products analyzed: 250
Publish ready: 205
Review required: 31
Blocked: 14
Top problems:
1. Missing structured specifications - 38 products
2. Product Truth conflicts - 14 products
3. Missing image alt text - 27 products
Priority focus:
Resolve the 14 blocked truth-conflict recommendations first.
```

This example is deterministic structured output, not AI-generated prose.
Catalog Health has no UI, persistence, historical trends, scheduled scans,
automatic remediation, publishing enforcement, external benchmarks, or
revenue/conversion estimates. Persistence and historical comparison can be
added later without changing the domain report contract.

## Deferred work

- Production category Knowledge Packs and non-deterministic Capability Packs
- Category-specific impossible and suspicious combination rules
- LLM-assisted contradiction producers
- Additional category-provided recommendation rule packs
- Persistent plan lifecycle, completion tracking, and merchant workflow UI
- Category-specific unit taxonomies
- Category-specific Product Truth comparison and resolution policies
- Source adapter implementations
- Evidence retrieval
- Product Truth persistence, APIs, UI, publishing integration, scheduling, and
  catalog-wide job orchestration
- Catalog Health persistence, historical trends, dashboard UI, and merchant
  workflow lifecycle
