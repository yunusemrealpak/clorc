import { describe, it, expect } from 'vitest';
import { parseReviewReport, getUnresolvedFindings } from '../src/parsers/review-parser.js';

describe('ReviewParser', () => {
  const sampleReport = `# Review Report — Milestone M1
**Date:** 2026-03-04
**Reviewer:** Review Agent
**Milestone:** Project skeleton

## Summary
Good overall quality with a few issues.

## Findings

### Critical
- **[ID: R001]** src/core/runner.ts: Missing error handling for spawn failures

### Major
- **[ID: R002]** src/agents/dev.ts: No timeout on API calls

### Minor
- **[ID: R003]** src/utils/logger.ts: Console.log should use structured format

### Suggestions
- Consider adding retry logic for transient failures

## Verdict
**Ready to ship:** No
**Conditions:** Fix R001 and R002 before shipping`;

  it('parses verdict correctly', () => {
    const result = parseReviewReport(sampleReport);
    expect(result.verdict).toBe('FAIL');
  });

  it('extracts findings', () => {
    const result = parseReviewReport(sampleReport);
    expect(result.findings).toHaveLength(3);
    expect(result.findings[0].id).toBe('R001');
    expect(result.findings[0].severity).toBe('critical');
    expect(result.findings[1].id).toBe('R002');
    expect(result.findings[1].severity).toBe('major');
    expect(result.findings[2].id).toBe('R003');
    expect(result.findings[2].severity).toBe('minor');
  });

  it('returns PASS for clean report', () => {
    const clean = `# Review Report
## Findings
### Minor
- **[ID: R001]** Small naming issue

## Verdict
**Ready to ship:** Yes`;

    const result = parseReviewReport(clean);
    expect(result.verdict).toBe('PASS');
  });

  it('getUnresolvedFindings returns critical and major only', () => {
    const result = parseReviewReport(sampleReport);
    const unresolved = getUnresolvedFindings(result);
    expect(unresolved).toHaveLength(2);
    expect(unresolved.map(f => f.id)).toEqual(['R001', 'R002']);
  });

  const reportWithVerification = `# Review Report
## Findings
### Critical
- **[ID: R001]** Missing validation

### Major
- **[ID: R002]** No error handling

## Verdict
FAIL

## Verification Round 1
R001 — Fixed
R002 — Not Fixed — still missing try-catch`;

  it('parses verification rounds', () => {
    const result = parseReviewReport(reportWithVerification);
    expect(result.verificationRounds).toHaveLength(1);
    expect(result.verificationRounds[0].round).toBe(1);
    expect(result.verificationRounds[0].results).toHaveLength(2);
    expect(result.verificationRounds[0].results[0].status).toBe('fixed');
    expect(result.verificationRounds[0].results[1].status).toBe('not_fixed');
    expect(result.verificationRounds[0].verdict).toBe('FAIL');
  });

  it('getUnresolvedFindings respects verification rounds', () => {
    const result = parseReviewReport(reportWithVerification);
    const unresolved = getUnresolvedFindings(result);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].id).toBe('R002');
  });
});
