import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import { evidenceFixture, issueFixture } from '../testing/fixtures.ts';
import {
  issueSemanticFingerprint,
  suppressDuplicateIssues,
} from './suppression.ts';

const hasher = new DeterministicHasher();

test('exact duplicate issues are suppressed deterministically', () => {
  const result = suppressDuplicateIssues({
    issues: [issueFixture(), issueFixture({ id: 'issue-2' })],
    evidence: [evidenceFixture()],
    hasher,
  });
  assert.equal(result.issues.length, 1);
  assert.equal(result.suppressedCount, 1);
});

test('semantically equivalent issues merge even when titles differ', () => {
  const result = suppressDuplicateIssues({
    issues: [
      issueFixture({ title: 'First title' }),
      issueFixture({ id: 'issue-2', title: 'Different wording' }),
    ],
    evidence: [evidenceFixture()],
    hasher,
  });
  assert.equal(result.issues.length, 1);
});

test('same title does not merge issues affecting different fields', () => {
  const result = suppressDuplicateIssues({
    issues: [
      issueFixture({ affectedFields: ['title'] }),
      issueFixture({ id: 'issue-2', affectedFields: ['description'] }),
    ],
    evidence: [evidenceFixture()],
    hasher,
  });
  assert.equal(result.issues.length, 2);
});

test('the same semantic issue from multiple detectors is merged', () => {
  const result = suppressDuplicateIssues({
    issues: [
      issueFixture({ detectorId: 'detector-a' }),
      issueFixture({ id: 'issue-2', detectorId: 'detector-b' }),
    ],
    evidence: [evidenceFixture()],
    hasher,
  });
  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.issues[0].metadata.originatingDetectorIds, [
    'detector-a',
    'detector-b',
  ]);
});

test('merge preserves highest severity', () => {
  const result = suppressDuplicateIssues({
    issues: [
      issueFixture({ severity: 'LOW' }),
      issueFixture({ id: 'issue-2', severity: 'CRITICAL' }),
    ],
    evidence: [evidenceFixture()],
    hasher,
  });
  assert.equal(result.issues[0].severity, 'CRITICAL');
  assert.equal(result.issues[0].id, 'issue-2');
});

test('merge combines evidence and orders strongest evidence first', () => {
  const first = evidenceFixture({ id: 'evidence-low', reliability: 'LOW' });
  const second = evidenceFixture({ id: 'evidence-official', reliability: 'OFFICIAL' });
  const result = suppressDuplicateIssues({
    issues: [
      issueFixture({ evidenceIds: [first.id] }),
      issueFixture({ id: 'issue-2', evidenceIds: [second.id] }),
    ],
    evidence: [first, second],
    hasher,
  });
  assert.deepEqual(result.issues[0].evidenceIds, ['evidence-official', 'evidence-low']);
});

test('merge retains traceability to every originating issue', () => {
  const result = suppressDuplicateIssues({
    issues: [issueFixture(), issueFixture({ id: 'issue-2' })],
    evidence: [evidenceFixture()],
    hasher,
  });
  assert.deepEqual(result.issues[0].metadata.originatingIssueIds, ['issue-1', 'issue-2']);
  assert.equal(result.issues[0].metadata.suppressedDuplicateCount, 1);
});

test('semantic fingerprints are reproducible regardless of affected-field order', () => {
  const evidence = evidenceFixture();
  const map = new Map([[evidence.id, evidence]]);
  const first = issueSemanticFingerprint(
    issueFixture({ affectedFields: ['title', 'description'] }),
    map,
    hasher,
  );
  const second = issueSemanticFingerprint(
    issueFixture({ affectedFields: ['description', 'title'] }),
    map,
    hasher,
  );
  assert.equal(first, second);
});

test('suppression never mutates original issues', () => {
  const issue = issueFixture();
  const before = JSON.stringify(issue);
  suppressDuplicateIssues({
    issues: [issue, issueFixture({ id: 'issue-2' })],
    evidence: [evidenceFixture()],
    hasher,
  });
  assert.equal(JSON.stringify(issue), before);
  assert.equal(issue.fingerprint, '');
});
