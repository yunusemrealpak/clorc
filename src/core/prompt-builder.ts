import type { Finding, Task, TaskContext } from '../types/index.js';

export class PromptBuilder {
  buildOrchestratorPrompt(mission: string): string {
    return `Proje dizinindeki mevcut kodu analiz et.

Görev: ${mission}

.agent/ dizinini oluştur (yoksa) ve şu dosyaları yaz:
- .agent/plan.md: Milestone'lara bölünmüş proje planı
- .agent/task_queue.json: Tüm task'lar, milestone bilgisi, assignee ve dependency'ler ile
- .agent/decisions.md: Mimari kararlar

Her milestone bağımsız ve test edilebilir bir deliverable olsun.
Her task'ın assignee'si "backend" veya "frontend" olsun.
task_queue.json'daki her task'ın milestone, id, title, description, assignee, status, priority, dependencies, acceptance_criteria ve notes alanları olsun.
Backend task ID'leri T0xx, frontend task ID'leri T1xx formatında olsun.`;
  }

  /**
   * Builds a prompt for a GROUP of tasks with context injected.
   * When isResumed=true, context is omitted (already in session memory).
   */
  buildGroupTaskPrompt(
    assignee: 'backend' | 'frontend',
    milestoneId: string,
    tasks: Task[],
    context: TaskContext,
    isResumed: boolean,
  ): string {
    const taskList = tasks
      .map(t => `- [${t.id}] ${t.title}: ${t.description}`)
      .join('\n');
    const taskIds = tasks.map(t => t.id).join(', ');

    const parts: string[] = [];

    if (!isResumed) {
      // First group in this session — inject all context
      parts.push('# Project Context');

      if (context.milestoneInfo) {
        parts.push(`## Milestone ${milestoneId}\n${context.milestoneInfo}`);
      }

      if (context.decisions) {
        parts.push(`## Architecture Decisions\n${context.decisions}`);
      }

      if (context.apiContract) {
        parts.push(`## API Contract\n${context.apiContract}`);
      }

      if (context.progress) {
        parts.push(`## Previous Progress\n${context.progress}`);
      }

      parts.push('---');
      parts.push('All context is above — do NOT spend turns reading .agent/ planning files.');
      parts.push('');
    }

    parts.push(`Milestone ${milestoneId} kapsamındaki şu task'ları implement et:`);
    parts.push(taskList);
    parts.push('');
    parts.push('Her task bitince:');
    parts.push('1. .agent/task_queue.json\'da bu task\'ın status\'ünü "done" yap');
    parts.push(`2. .agent/${assignee}/progress.md'ye ne yaptığını yaz`);

    if (assignee === 'backend') {
      parts.push("3. API değişikliği varsa .agent/shared/api_contract.md'yi güncelle");
    }

    const n = assignee === 'backend' ? 4 : 3;
    parts.push(`${n}. Testlerini yaz ve geçtiğinden emin ol`);
    parts.push(`${n + 1}. Commit oluştur: "feat(${assignee}): <summary> [${taskIds}]"`);

    return parts.join('\n');
  }

  /**
   * Legacy: single task prompt (used as fallback when context is not available).
   */
  buildSingleTaskPrompt(
    assignee: 'backend' | 'frontend',
    milestoneId: string,
    task: Task,
  ): string {
    return `.agent/plan.md, .agent/task_queue.json ve .agent/decisions.md dosyalarını oku.
.agent/shared/api_contract.md varsa onu da oku.
.agent/${assignee}/progress.md varsa onu da oku.

Milestone ${milestoneId} kapsamındaki şu tek task'ı implement et:
- [${task.id}] ${task.title}: ${task.description}

Task bitince:
1. .agent/task_queue.json'da bu task'ın status'ünü "done" yap
2. .agent/${assignee}/progress.md'ye ne yaptığını yaz
${assignee === 'backend' ? '3. API değişikliği varsa .agent/shared/api_contract.md\'yi güncelle\n' : ''}4. Testlerini yaz ve geçtiğinden emin ol
5. Commit oluştur: "feat(${assignee}): ${task.title} [${task.id}]"`;
  }

  buildReviewPrompt(milestoneId: string, backendTasks: Task[], frontendTasks: Task[]): string {
    const bList = backendTasks.map(t => `[${t.id}] ${t.title}`).join(', ');
    const fList = frontendTasks.map(t => `[${t.id}] ${t.title}`).join(', ');

    return `.agent/plan.md, .agent/task_queue.json, .agent/decisions.md,
.agent/shared/api_contract.md, .agent/backend/progress.md ve
.agent/frontend/progress.md dosyalarını oku.

Milestone ${milestoneId} review'ını yap. Backend task'lar: ${bList || 'yok'}. Frontend task'lar: ${fList || 'yok'}.

Gerçek kaynak kodunu oku, sadece progress.md'ye güvenme.
Raporu .agent/review/milestone-${milestoneId}-review.md dosyasına yaz.

Rapor formatı:
## Findings
Her finding için:
- ID: R001, R002...
- Severity: critical | major | minor
- Assignee: backend | frontend
- Description: Ne yanlış
- Suggestion: Nasıl düzeltilmeli

## Verdict
- PASS: Finding yok veya sadece minor
- FAIL: Critical veya major finding var`;
  }

  buildVerificationPrompt(milestoneId: string, findingIds: string[]): string {
    return `.agent/review/milestone-${milestoneId}-review.md dosyasını oku.

Şu finding'lerin fix edilip edilmediğini kaynak kodunu okuyarak verify et:
${findingIds.join(', ')}

Her finding için "Fixed" veya "Not Fixed — [neden]" yaz.
Sonucu aynı dosyaya "## Verification Round" bölümü olarak ekle.

Tüm finding'ler fixed ise verdict'i PASS olarak güncelle.`;
  }

  buildFixPrompt(assignee: 'backend' | 'frontend', findings: Finding[]): string {
    const findingList = findings
      .map(f => `- [${f.id}] (${f.severity}) ${f.description}${f.suggestion ? ` → Öneri: ${f.suggestion}` : ''}`)
      .join('\n');

    return `.agent/plan.md ve .agent/task_queue.json dosyalarını oku.

Review'da tespit edilen şu sorunları düzelt:
${findingList}

Her fix için:
1. Kaynak kodunu düzelt
2. Testleri güncelle (gerekiyorsa)
3. .agent/${assignee}/progress.md'ye ne yaptığını yaz
4. Commit oluştur: "fix(${assignee}): {finding_id} açıklaması"`;
  }
}
