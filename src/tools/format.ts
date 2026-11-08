import type {
  Task,
  TaskHistoryEntry,
  TaskTodo,
  Workplace,
} from '../api/task.js';
import type { Person } from '../api/family.js';

export function ageFromBirthDate(
  birthDate: string | null | undefined,
  atDate: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const end = atDate;
  let age = end.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = end.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function formatPersonSummary(
  person: Person,
  includeContact = false,
): Record<string, unknown> {
  const deceased = person.status === 'deceased';
  const age = deceased ? null : ageFromBirthDate(person.birthDate);
  const deathDate = person.deathDate
    ? new Date(`${person.deathDate}T00:00:00Z`)
    : null;
  const ageAtDeath =
    deceased && deathDate && !Number.isNaN(deathDate.getTime())
      ? ageFromBirthDate(person.birthDate, deathDate)
      : null;

  return {
    id: person.id,
    fullName: person.fullName,
    nickname: person.nickname,
    gender: person.gender,
    status: person.status,
    birthDate: person.birthDate,
    deathDate: person.deathDate,
    age,
    ageAtDeath,
    occupation: person.occupation ?? null,
    generationLabel: person.generationLabel ?? null,
    isSelf: person.isSelf ?? false,
    ...(includeContact
      ? {
          phone: person.phone ?? null,
          phoneAlt: person.phoneAlt ?? null,
          address: person.address ?? null,
        }
      : {}),
  };
}

export function formatPersonDetail(
  person: Person & { fatherId: number | null; motherId: number | null; spouseIds: number[] },
  includeContact = false,
): Record<string, unknown> {
  return {
    ...formatPersonSummary(person, includeContact),
    fatherId: person.fatherId,
    motherId: person.motherId,
    spouseIds: person.spouseIds,
    religion: person.religion ?? null,
    photoUrl: person.photoUrl ?? null,
    role: person.role ?? null,
  };
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatTaskSummary(task: Task): Record<string, unknown> {
  const descriptions = task.descriptions ?? [];
  const firstContent = descriptions[0]?.content;
  const preview = stripHtml(firstContent).slice(0, 180);
  const todos = task.todos ?? [];

  return {
    id: task.id,
    type: task.type,
    title: task.title,
    status: task.status,
    branchName: task.branch_name,
    workplaceId: task.workplace_id,
    parentTaskId: task.parent_task_id,
    descriptionTitles: descriptions.map((item) => item.title),
    descriptionPreview: preview,
    todoCount: todos.length > 0 ? todos.length : undefined,
    openTodoCount:
      todos.length > 0 ? todos.filter((item) => !item.is_done).length : undefined,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

export function formatTaskDetail(task: Task): Record<string, unknown> {
  return {
    ...formatTaskSummary(task),
    descriptions: (task.descriptions ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      sortOrder: item.sort_order,
    })),
    deployNotes: task.deploy_notes,
    migrationFiles: task.migration_files ?? [],
    links: task.links ?? [],
    images: task.images ?? [],
    parentTask: task.parent_task ? formatTaskSummary(task.parent_task) : null,
    revisions: (task.revisions ?? []).map(formatTaskSummary),
    history: (task.history ?? []).map(formatTaskHistory),
    todos: (task.todos ?? []).map(formatTaskTodo),
  };
}

export function formatTaskHistory(
  entry: TaskHistoryEntry,
): Record<string, unknown> {
  return {
    id: entry.id,
    action: entry.action,
    status: entry.status,
    notes: entry.notes,
    relatedTaskId: entry.related_task_id,
    relatedTaskTitle: entry.related_task_title,
    changedAt: entry.changed_at,
  };
}

export function formatTaskTodo(todo: TaskTodo): Record<string, unknown> {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    isDone: todo.is_done,
    sortOrder: todo.sort_order,
    createdAt: todo.created_at,
    updatedAt: todo.updated_at,
  };
}

export function formatWorkplace(workplace: Workplace): Record<string, unknown> {
  return {
    id: workplace.id,
    name: workplace.name,
    employmentType: workplace.employment_type,
    role: workplace.role,
    location: workplace.location,
    accent: workplace.accent,
    startedAt: workplace.started_at,
    endedAt: workplace.ended_at,
    isDefault: workplace.is_default,
    archivedAt: workplace.archived_at,
  };
}
