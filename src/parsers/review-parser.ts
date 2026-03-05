import type { Finding, ReviewResult, VerificationRound, FindingSeverity } from '../types/index.js';

export function parseReviewReport(content: string): ReviewResult {
  return {
    verdict: parseVerdict(content),
    findings: parseFindings(content),
    verificationRounds: parseVerificationRounds(content),
  };
}

function parseVerdict(content: string): 'PASS' | 'FAIL' {
  // Check for verdict in multiple formats
  const verdictMatch = content.match(/\*\*(?:Ready to ship|Verdict):\*\*\s*(Yes|No|PASS|FAIL)/i);
  if (verdictMatch) {
    const val = verdictMatch[1].toUpperCase();
    if (val === 'YES' || val === 'PASS') return 'PASS';
    return 'FAIL';
  }

  // Check for ## Verdict section
  const verdictSection = content.match(/##\s*Verdict[\s\S]*?(PASS|FAIL)/i);
  if (verdictSection) {
    return verdictSection[1].toUpperCase() as 'PASS' | 'FAIL';
  }

  // If findings with critical/major exist, it's FAIL
  const findings = parseFindings(content);
  const hasCriticalOrMajor = findings.some(
    f => f.severity === 'critical' || f.severity === 'major',
  );
  return hasCriticalOrMajor ? 'FAIL' : 'PASS';
}

function parseFindings(content: string): Finding[] {
  const findings: Finding[] = [];

  // Match patterns like: **[ID: R001]** file/path: description
  // or - **R001** description
  const findingRegex = /\*\*\[?(?:ID:\s*)?([Rr]\d{3})\]?\*\*\s*(?:\[?([^\]:\n]+)\]?[:\s]*)?\s*(.+)/g;
  let match: RegExpExecArray | null;

  // Track which severity section we're in
  let currentSeverity: FindingSeverity = 'minor';
  const lines = content.split('\n');

  for (const line of lines) {
    const sectionMatch = line.match(/^###\s*(Critical|Major|Minor|Suggestion)/i);
    if (sectionMatch) {
      const sev = sectionMatch[1].toLowerCase();
      if (sev === 'suggestion') currentSeverity = 'suggestion';
      else currentSeverity = sev as FindingSeverity;
      continue;
    }

    findingRegex.lastIndex = 0;
    match = findingRegex.exec(line);
    if (match) {
      const id = match[1].toUpperCase();
      const file = match[2]?.trim();
      const description = match[3].trim();

      // Determine assignee from description or default
      let assignee: 'backend' | 'frontend' = 'backend';
      if (description.toLowerCase().includes('frontend') ||
          description.toLowerCase().includes('ui') ||
          description.toLowerCase().includes('component') ||
          description.toLowerCase().includes('widget')) {
        assignee = 'frontend';
      }

      // Check if there's an explicit assignee pattern
      const assigneeMatch = description.match(/(?:assignee|assigned):\s*(backend|frontend)/i);
      if (assigneeMatch) {
        assignee = assigneeMatch[1].toLowerCase() as 'backend' | 'frontend';
      }

      findings.push({
        id,
        severity: currentSeverity,
        assignee,
        description,
        suggestion: '',
        file: file || undefined,
      });
    }
  }

  return findings;
}

function parseVerificationRounds(content: string): VerificationRound[] {
  const rounds: VerificationRound[] = [];
  const roundRegex = /##\s*Verification Round\s*(\d+)/gi;
  let match: RegExpExecArray | null;
  const sections: Array<{ round: number; startIndex: number }> = [];

  while ((match = roundRegex.exec(content)) !== null) {
    sections.push({ round: parseInt(match[1]), startIndex: match.index });
  }

  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].startIndex;
    const end = i + 1 < sections.length ? sections[i + 1].startIndex : content.length;
    const sectionContent = content.slice(start, end);

    const results: VerificationRound['results'] = [];

    // Match: R001 — Fixed or R001 — Not Fixed — reason
    const resultRegex = /([Rr]\d{3})\s*[—–-]\s*(Fixed|Not Fixed)(?:\s*[—–-]\s*(.+))?/g;
    let resultMatch: RegExpExecArray | null;
    while ((resultMatch = resultRegex.exec(sectionContent)) !== null) {
      results.push({
        findingId: resultMatch[1].toUpperCase(),
        status: resultMatch[2].toLowerCase() === 'fixed' ? 'fixed' : 'not_fixed',
        reason: resultMatch[3]?.trim(),
      });
    }

    const allFixed = results.every(r => r.status === 'fixed');
    rounds.push({
      round: sections[i].round,
      results,
      verdict: allFixed ? 'PASS' : 'FAIL',
    });
  }

  return rounds;
}

export function getUnresolvedFindings(result: ReviewResult): Finding[] {
  if (result.verificationRounds.length === 0) {
    return result.findings.filter(
      f => f.severity === 'critical' || f.severity === 'major',
    );
  }

  const lastRound = result.verificationRounds[result.verificationRounds.length - 1];
  const fixedIds = new Set(
    lastRound.results.filter(r => r.status === 'fixed').map(r => r.findingId),
  );

  return result.findings.filter(
    f => (f.severity === 'critical' || f.severity === 'major') && !fixedIds.has(f.id),
  );
}
