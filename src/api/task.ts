import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client.js';
import { compact } from '../utils/objects.js';

export type TaskType = 'Bugfixing' | 'Feature' | 'Refactor';
export type TaskStatus = 'To-Do' | 'In Progress' | 'Merge Request' | 'Merged';
export type TaskLinkType = 'discord' | 'notion' | 'mr';
export type EmploymentType =
  | 'Fulltime'
  | 'Freelance'
  | 'Part-time'
  | 'Contract'
  | 'Personal';

export type TaskDescription = {
  id?: number;
  title: string;
  content: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type TaskDescriptionInput = {
  id?: number;
  title: string;
  content: string;
};

export type TaskLink = {
  id?: number;
  type: TaskLinkType;
  url: string;
};

export type TaskTodo = {
  id: number;
  task_id: number;
  title: string;
  description: string;
  is_done: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
};

export type TaskHistoryEntry = {
  id: number;
  action:
    | 'created'
    | 'status_changed'
    | 'description_added'
    | 'description_updated'
    | 'description_removed'
    | 'revision_created';
  status: string;
  notes: string | null;
  related_task_id: number | null;
  related_task_title: string | null;
  changed_at: string;
};

export type Task = {
  id: number;
  person_id: number;
  type: TaskType;
  title: string;
  branch_name: string;
  status: TaskStatus;
  descriptions: TaskDescription[];
  description: string | null;
  deploy_notes: string | null;
  migration_files: string[];
  parent_task_id: number | null;
  workplace_id: number | null;
  sort_order: number;
  links: TaskLink[];
  images: Array<{ id?: number; url: string }>;
  parent_task?: Task | null;
  revisions?: Task[];
  history?: TaskHistoryEntry[];
  todos?: TaskTodo[];
  created_at: string;
  updated_at: string;
};

export type Workplace = {
  id: number;
  person_id: number;
  name: string;
  employment_type: EmploymentType;
  role: string | null;
  location: string | null;
  accent: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskListQuery = {
  type?: TaskType;
  status?: TaskStatus;
  search?: string;
  workplaceId?: number;
};

export type TaskCreateInput = {
  type: TaskType;
  title: string;
  branchName: string;
  status?: TaskStatus;
  descriptions: TaskDescriptionInput[];
  deployNotes?: string;
  migrationFiles?: string[];
  parentTaskId?: number | null;
  workplaceId?: number | null;
  notes?: string;
  links?: TaskLink[];
};

export type TaskUpdateInput = {
  type?: TaskType;
  title?: string;
  branchName?: string;
  status?: TaskStatus;
  descriptions?: TaskDescriptionInput[];
  deployNotes?: string;
  migrationFiles?: string[];
  parentTaskId?: number | null;
  workplaceId?: number | null;
  notes?: string;
  links?: TaskLink[];
};

export type WorkplaceCreateInput = {
  name: string;
  employmentType: EmploymentType;
  role?: string | null;
  location?: string | null;
  accent?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

export type WorkplaceUpdateInput = Partial<WorkplaceCreateInput>;

function toTaskCreateBody(input: TaskCreateInput): Record<string, unknown> {
  return compact({
    type: input.type,
    title: input.title,
    branchName: input.branchName,
    status: input.status,
    descriptions: input.descriptions,
    deployNotes: input.deployNotes,
    migration_files: input.migrationFiles,
    parent_task_id: input.parentTaskId,
    workplace_id: input.workplaceId,
    notes: input.notes,
    links: input.links,
  });
}

function toTaskUpdateBody(input: TaskUpdateInput): Record<string, unknown> {
  return compact({
    type: input.type,
    title: input.title,
    branchName: input.branchName,
    status: input.status,
    descriptions: input.descriptions,
    deployNotes: input.deployNotes,
    migration_files: input.migrationFiles,
    parent_task_id: input.parentTaskId,
    workplace_id: input.workplaceId,
    notes: input.notes,
    links: input.links,
  });
}

function toWorkplaceBody(
  input: WorkplaceCreateInput | WorkplaceUpdateInput,
): Record<string, unknown> {
  return compact({
    name: input.name,
    employment_type: input.employmentType,
    role: input.role,
    location: input.location,
    accent: input.accent,
    started_at: input.startedAt,
    ended_at: input.endedAt,
  });
}

export async function listTasks(query: TaskListQuery = {}): Promise<Task[]> {
  return apiGet<Task[]>('/tasks', {
    type: query.type,
    status: query.status,
    search: query.search,
    workplace_id: query.workplaceId,
  });
}

export async function getTask(taskId: number): Promise<Task> {
  return apiGet<Task>(`/tasks/${taskId}`);
}

export async function getTaskHistory(
  taskId: number,
): Promise<TaskHistoryEntry[]> {
  return apiGet<TaskHistoryEntry[]>(`/tasks/${taskId}/history`);
}

export async function getTaskRevisions(taskId: number): Promise<Task[]> {
  return apiGet<Task[]>(`/tasks/${taskId}/revisions`);
}

export async function listTaskTodos(taskId: number): Promise<TaskTodo[]> {
  return apiGet<TaskTodo[]>(`/tasks/${taskId}/todos`);
}

export async function createTask(input: TaskCreateInput): Promise<Task> {
  return apiPost<Task>('/tasks', toTaskCreateBody(input));
}

export async function updateTask(
  taskId: number,
  input: TaskUpdateInput,
): Promise<Task> {
  return apiPut<Task>(`/tasks/${taskId}`, toTaskUpdateBody(input));
}

export async function deleteTask(taskId: number): Promise<{ deleted: boolean }> {
  return apiDelete<{ deleted: boolean }>(`/tasks/${taskId}`);
}

export async function createTaskTodo(
  taskId: number,
  input: { title: string; description?: string },
): Promise<TaskTodo> {
  return apiPost<TaskTodo>(`/tasks/${taskId}/todos`, input);
}

export async function updateTaskTodo(
  taskId: number,
  todoId: number,
  input: { title?: string; description?: string; isDone?: boolean },
): Promise<TaskTodo> {
  return apiPatch<TaskTodo>(
    `/tasks/${taskId}/todos/${todoId}`,
    compact({
      title: input.title,
      description: input.description,
      is_done: input.isDone,
    }),
  );
}

export async function deleteTaskTodo(
  taskId: number,
  todoId: number,
): Promise<void> {
  await apiDelete<unknown>(`/tasks/${taskId}/todos/${todoId}`);
}

export async function listWorkplaces(): Promise<Workplace[]> {
  const data = await apiGet<{ items?: Workplace[] }>('/workplaces');
  return data.items ?? [];
}

export async function createWorkplace(
  input: WorkplaceCreateInput,
): Promise<Workplace> {
  return apiPost<Workplace>('/workplaces', toWorkplaceBody(input));
}

export async function updateWorkplace(
  workplaceId: number,
  input: WorkplaceUpdateInput,
): Promise<Workplace> {
  return apiPut<Workplace>(
    `/workplaces/${workplaceId}`,
    toWorkplaceBody(input),
  );
}

export async function archiveWorkplace(
  workplaceId: number,
): Promise<Workplace> {
  return apiPatch<Workplace>(`/workplaces/${workplaceId}/archive`);
}

export async function unarchiveWorkplace(
  workplaceId: number,
): Promise<Workplace> {
  return apiPatch<Workplace>(`/workplaces/${workplaceId}/unarchive`);
}

export async function deleteWorkplace(
  workplaceId: number,
): Promise<{ deleted: boolean }> {
  return apiDelete<{ deleted: boolean }>(`/workplaces/${workplaceId}`);
}
