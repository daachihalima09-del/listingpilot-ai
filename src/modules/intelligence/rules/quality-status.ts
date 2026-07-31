import type { IntelligenceIssue, IssueSeverity } from '../domain/types.ts';

export type RuleQualityStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL';

const severityRank: Readonly<Record<IssueSeverity, number>> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface RuleQualityStatusResult {
  readonly status: RuleQualityStatus;
  readonly failureSeverity: IssueSeverity;
  readonly issueCount: number;
  readonly failingIssueCount: number;
  readonly warningIssueCount: number;
}

export function evaluateRuleQualityStatus(
  issues: readonly IntelligenceIssue[],
  failureSeverity: IssueSeverity = 'HIGH',
): RuleQualityStatusResult {
  const threshold = severityRank[failureSeverity];
  const failingIssueCount = issues.filter(({ severity }) => severityRank[severity] >= threshold).length;
  const warningIssueCount = issues.length - failingIssueCount;
  return Object.freeze({
    status: failingIssueCount > 0
      ? 'FAIL'
      : warningIssueCount > 0
        ? 'PASS_WITH_WARNINGS'
        : 'PASS',
    failureSeverity,
    issueCount: issues.length,
    failingIssueCount,
    warningIssueCount,
  });
}
