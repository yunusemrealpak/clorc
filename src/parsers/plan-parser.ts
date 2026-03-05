export interface ParsedMilestone {
  id: string;
  title: string;
}

export function parseMilestones(planContent: string): ParsedMilestone[] {
  const milestones: ParsedMilestone[] = [];
  const lines = planContent.split('\n');

  for (const line of lines) {
    // Match ### M1: Title or ### M1 — Title patterns
    const match = line.match(/^###\s+(M\d+)[:\s—–-]+\s*(.+)/);
    if (match) {
      milestones.push({ id: match[1], title: match[2].trim() });
    }
  }

  return milestones;
}
