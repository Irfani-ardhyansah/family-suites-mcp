import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  archiveWorkplace,
  createTask,
  createTaskTodo,
  createWorkplace,
  deleteTask,
  deleteTaskTodo,
  deleteWorkplace,
  getTask,
  getTaskHistory,
  getTaskRevisions,
  listTaskTodos,
  listTasks,
  listWorkplaces,
  unarchiveWorkplace,
  updateTask,
  updateTaskTodo,
  updateWorkplace,
  type EmploymentType,
  type TaskCreateInput,
  type TaskDescriptionInput,
  type TaskLink,
  type TaskStatus,
  type TaskType,
  type TaskUpdateInput,
} from '../api/task.js';
import { getMe } from '../api/family.js';
import { ToolInputError } from '../errors.js';
import {
  formatTaskDetail,
  formatTaskHistory,
  formatTaskSummary,
  formatTaskTodo,
  formatWorkplace,
} from './format.js';
import {
  fail,
  ok,
  requireConfirm,
  requireDestructiveEnabled,
  requireWriteEnabled,
} from './result.js';

const taskTypes = ['Bugfixing', 'Feature', 'Refactor'] as const;
const taskStatuses = ['To-Do', 'In Progress', 'Merge Request', 'Merged'] as const;
const linkTypes = ['discord', 'notion', 'mr'] as const;
const employmentTypes = [
  'Fulltime',
  'Freelance',
  'Part-time',
  'Contract',
  'Personal',
] as const;

const descriptionSchema = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(255),
  content: z.string(),
});

const linkSchema = z.object({
  type: z.enum(linkTypes),
  url: z.string().url(),
});

const migrationFileSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]+\.(ts|js|sql)$/, 'Hanya nama file .ts/.js/.sql, bukan path.');

function requireAtLeastOne(
  input: Record<string, unknown>,
  message: string,
): void {
  if (Object.values(input).every((value) => value === undefined)) {
    throw new ToolInputError(message);
  }
}

function toTaskLinks(
  links: Array<{ type: (typeof linkTypes)[number]; url: string }> | undefined,
): TaskLink[] | undefined {
  return links?.map((link) => ({ type: link.type, url: link.url }));
}

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    'task_get_context',
    {
      title: 'Konteks Task Board',
      description:
        'Tool pertama untuk Task Board: identitas pemilik token, recent task, jumlah task, workplace, dan nilai status/type yang valid.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const [me, tasks, workplaces] = await Promise.all([
          getMe(),
          listTasks(),
          listWorkplaces(),
        ]);
        return ok({
          person: {
            id: me.id,
            fullName: me.fullName,
            nickname: me.nickname,
            role: me.role,
          },
          taskCount: tasks.length,
          recentTasks: tasks.slice(0, 10).map(formatTaskSummary),
          workplaces: workplaces.map(formatWorkplace),
          validTypes: taskTypes,
          validStatuses: taskStatuses,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_list',
    {
      title: 'Daftar task',
      description:
        'Daftar task milik person pemilik token. Urut updated_at terbaru dari API. Filter opsional type/status/search/workplaceId.',
      inputSchema: {
        type: z.enum(taskTypes).optional(),
        status: z.enum(taskStatuses).optional(),
        search: z.string().trim().max(120).optional(),
        workplaceId: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        const tasks = await listTasks(input);
        return ok(
          {
            count: tasks.length,
            tasks: tasks.map(formatTaskSummary),
          },
          `${tasks.length} task ditemukan.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_get',
    {
      title: 'Detail task',
      description:
        'Detail lengkap satu task: deskripsi, history, todo, revisi, parent, link, migration files, dan gambar.',
      inputSchema: {
        taskId: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ taskId }) => {
      try {
        return ok(formatTaskDetail(await getTask(taskId)));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_list_history',
    {
      title: 'Riwayat task',
      description:
        'Riwayat status/deskripsi/revisi sebuah task, terbaru lebih dulu dari API.',
      inputSchema: {
        taskId: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ taskId }) => {
      try {
        const history = await getTaskHistory(taskId);
        return ok({
          taskId,
          count: history.length,
          history: history.map(formatTaskHistory),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_list_revisions',
    {
      title: 'Daftar revisi task',
      description: 'Daftar task anak/revisi dari sebuah task induk.',
      inputSchema: {
        taskId: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ taskId }) => {
      try {
        const revisions = await getTaskRevisions(taskId);
        return ok({
          taskId,
          count: revisions.length,
          revisions: revisions.map(formatTaskSummary),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_list_todos',
    {
      title: 'Checklist task',
      description: 'Daftar todo/checklist dalam sebuah task.',
      inputSchema: {
        taskId: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ taskId }) => {
      try {
        const todos = await listTaskTodos(taskId);
        return ok({
          taskId,
          count: todos.length,
          todos: todos.map(formatTaskTodo),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_list_workplaces',
    {
      title: 'Daftar tempat kerja',
      description:
        'Daftar workplace milik person pemilik token, termasuk yang sudah diarsipkan.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const workplaces = await listWorkplaces();
        return ok({
          count: workplaces.length,
          workplaces: workplaces.map(formatWorkplace),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_create',
    {
      title: 'Buat task',
      description:
        'Buat task baru. Wajib type, title, branchName, dan minimal satu descriptions. MCP hanya mencatat branchName; tidak membuat branch Git. Status "Done" tidak valid; gunakan "Merged".',
      inputSchema: {
        type: z.enum(taskTypes),
        title: z.string().trim().min(1).max(255),
        branchName: z.string().trim().min(1).max(255),
        status: z.enum(taskStatuses).optional(),
        descriptions: z.array(descriptionSchema).min(1),
        deployNotes: z.string().max(100_000).optional(),
        migrationFiles: z.array(migrationFileSchema).optional(),
        parentTaskId: z.number().int().positive().nullable().optional(),
        workplaceId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(2000).optional(),
        links: z.array(linkSchema).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      try {
        requireWriteEnabled();
        const payload: TaskCreateInput = {
          type: input.type as TaskType,
          title: input.title,
          branchName: input.branchName,
          status: input.status as TaskStatus | undefined,
          descriptions: input.descriptions,
          deployNotes: input.deployNotes,
          migrationFiles: input.migrationFiles,
          parentTaskId: input.parentTaskId,
          workplaceId: input.workplaceId,
          notes: input.notes,
          links: toTaskLinks(input.links),
        };
        const task = await createTask(payload);
        return ok(
          formatTaskDetail(task),
          `Task #${task.id} dibuat dengan status ${task.status}.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_update',
    {
      title: 'Update task',
      description:
        'Update partial task. PENTING: descriptions bersifat replace-all; kirim array lengkap. Untuk mengubah satu deskripsi, pakai task_update_description. Untuk status, pakai task_set_status.',
      inputSchema: {
        taskId: z.number().int().positive(),
        type: z.enum(taskTypes).optional(),
        title: z.string().trim().min(1).max(255).optional(),
        branchName: z.string().trim().min(1).max(255).optional(),
        status: z.enum(taskStatuses).optional(),
        descriptions: z.array(descriptionSchema).min(1).optional(),
        deployNotes: z.string().max(100_000).optional(),
        migrationFiles: z.array(migrationFileSchema).optional(),
        parentTaskId: z.number().int().positive().nullable().optional(),
        workplaceId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(2000).optional(),
        links: z.array(linkSchema).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ taskId, ...input }) => {
      try {
        requireWriteEnabled();
        requireAtLeastOne(
          input,
          'Minimal satu field harus diisi untuk update task.',
        );
        const payload: TaskUpdateInput = {
          type: input.type as TaskType | undefined,
          title: input.title,
          branchName: input.branchName,
          status: input.status as TaskStatus | undefined,
          descriptions: input.descriptions,
          deployNotes: input.deployNotes,
          migrationFiles: input.migrationFiles,
          parentTaskId: input.parentTaskId,
          workplaceId: input.workplaceId,
          notes: input.notes,
          links: toTaskLinks(input.links),
        };
        const task = await updateTask(taskId, payload);
        return ok(formatTaskDetail(task), `Task #${task.id} diperbarui.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_create_revision',
    {
      title: 'Buat revisi task',
      description:
        'Buat task revisi dari task induk. Induk WAJIB berstatus "Merged"; selain itu API menolak 422. History induk otomatis mendapat revision_created.',
      inputSchema: {
        parentTaskId: z.number().int().positive(),
        type: z.enum(taskTypes),
        title: z.string().trim().min(1).max(255),
        branchName: z.string().trim().min(1).max(255),
        status: z.enum(taskStatuses).optional(),
        descriptions: z.array(descriptionSchema).min(1),
        deployNotes: z.string().max(100_000).optional(),
        migrationFiles: z.array(migrationFileSchema).optional(),
        workplaceId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(2000).optional(),
        links: z.array(linkSchema).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      try {
        requireWriteEnabled();
        const task = await createTask({
          type: input.type as TaskType,
          title: input.title,
          branchName: input.branchName,
          status: input.status as TaskStatus | undefined,
          descriptions: input.descriptions,
          deployNotes: input.deployNotes,
          migrationFiles: input.migrationFiles,
          parentTaskId: input.parentTaskId,
          workplaceId: input.workplaceId,
          notes: input.notes,
          links: toTaskLinks(input.links),
        });
        return ok(
          formatTaskDetail(task),
          `Revisi #${task.id} dibuat dari task induk #${input.parentTaskId}.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_set_status',
    {
      title: 'Ubah status task',
      description:
        'Ubah status task dan catat notes ke history. Status valid: To-Do, In Progress, Merge Request, Merged. "Done" tidak valid.',
      inputSchema: {
        taskId: z.number().int().positive(),
        status: z.enum(taskStatuses),
        notes: z.string().max(2000).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ taskId, status, notes }) => {
      try {
        requireWriteEnabled();
        const task = await updateTask(taskId, {
          status: status as TaskStatus,
          notes,
        });
        return ok(
          formatTaskDetail(task),
          `Task #${task.id} sekarang berstatus ${task.status}.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_set_branch',
    {
      title: 'Ubah branch task',
      description:
        'Ganti branchName yang dicatat di task. Tidak ada operasi Git apa pun.',
      inputSchema: {
        taskId: z.number().int().positive(),
        branchName: z.string().trim().min(1).max(255),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ taskId, branchName }) => {
      try {
        requireWriteEnabled();
        const task = await updateTask(taskId, { branchName });
        return ok(
          formatTaskSummary(task),
          `Branch task #${task.id} dicatat sebagai ${task.branch_name}.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_add_description',
    {
      title: 'Tambah deskripsi task',
      description:
        'Tambah satu entri deskripsi. Pola read-modify-write: baca task, kirim ulang semua deskripsi lama + yang baru.',
      inputSchema: {
        taskId: z.number().int().positive(),
        title: z.string().trim().min(1).max(255),
        content: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ taskId, title, content }) => {
      try {
        requireWriteEnabled();
        const task = await getTask(taskId);
        const descriptions: TaskDescriptionInput[] = (task.descriptions ?? []).map(
          (item) => ({
            id: item.id,
            title: item.title,
            content: item.content,
          }),
        );
        descriptions.push({ title, content });
        const updated = await updateTask(taskId, { descriptions });
        return ok(
          formatTaskDetail(updated),
          `Deskripsi "${title}" ditambahkan ke task #${taskId}.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_update_description',
    {
      title: 'Ubah deskripsi task',
      description:
        'Ubah title/content satu entri deskripsi berdasarkan descriptionId. Kirim ulang semua deskripsi lain apa adanya.',
      inputSchema: {
        taskId: z.number().int().positive(),
        descriptionId: z.number().int().positive(),
        title: z.string().trim().min(1).max(255).optional(),
        content: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ taskId, descriptionId, title, content }) => {
      try {
        requireWriteEnabled();
        if (title === undefined && content === undefined) {
          throw new ToolInputError('Isi minimal title atau content.');
        }
        const task = await getTask(taskId);
        const descriptions = (task.descriptions ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          content: item.content,
        }));
        const target = descriptions.find((item) => item.id === descriptionId);
        if (!target) {
          throw new ToolInputError(
            `Deskripsi #${descriptionId} tidak ditemukan di task #${taskId}.`,
          );
        }
        if (title !== undefined) target.title = title;
        if (content !== undefined) target.content = content;
        const updated = await updateTask(taskId, { descriptions });
        return ok(
          formatTaskDetail(updated),
          `Deskripsi #${descriptionId} diperbarui.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_remove_description',
    {
      title: 'Hapus deskripsi task',
      description:
        'Hapus satu entri deskripsi. Minimal satu deskripsi harus tersisa; API menolak descriptions kosong.',
      inputSchema: {
        taskId: z.number().int().positive(),
        descriptionId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ taskId, descriptionId }) => {
      try {
        requireWriteEnabled();
        const task = await getTask(taskId);
        const descriptions = (task.descriptions ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          content: item.content,
        }));
        const next = descriptions.filter((item) => item.id !== descriptionId);
        if (next.length === descriptions.length) {
          throw new ToolInputError(
            `Deskripsi #${descriptionId} tidak ditemukan di task #${taskId}.`,
          );
        }
        if (next.length === 0) {
          throw new ToolInputError(
            'Task harus punya minimal satu deskripsi. Tambah deskripsi lain dulu.',
          );
        }
        const updated = await updateTask(taskId, { descriptions: next });
        return ok(
          formatTaskDetail(updated),
          `Deskripsi #${descriptionId} dihapus dari task #${taskId}.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_add_todo',
    {
      title: 'Tambah todo task',
      description: 'Tambah item checklist ke sebuah task.',
      inputSchema: {
        taskId: z.number().int().positive(),
        title: z.string().trim().min(1).max(255),
        description: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ taskId, title, description }) => {
      try {
        requireWriteEnabled();
        const todo = await createTaskTodo(taskId, { title, description });
        return ok(formatTaskTodo(todo), `Todo "${title}" ditambahkan.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_update_todo',
    {
      title: 'Update todo task',
      description:
        'Update title/description/isDone sebuah todo. Pakai isDone=true untuk menandai selesai.',
      inputSchema: {
        taskId: z.number().int().positive(),
        todoId: z.number().int().positive(),
        title: z.string().trim().min(1).max(255).optional(),
        description: z.string().optional(),
        isDone: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ taskId, todoId, title, description, isDone }) => {
      try {
        requireWriteEnabled();
        requireAtLeastOne(
          { title, description, isDone },
          'Isi minimal satu field todo.',
        );
        const todo = await updateTaskTodo(taskId, todoId, {
          title,
          description,
          isDone,
        });
        return ok(formatTaskTodo(todo), `Todo #${todoId} diperbarui.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_delete_todo',
    {
      title: 'Hapus todo task',
      description:
        'Hapus todo secara permanen. Butuh FAMILY_MCP_ENABLE_DESTRUCTIVE=true dan konfirmasi eksplisit.',
      inputSchema: {
        taskId: z.number().int().positive(),
        todoId: z.number().int().positive(),
        confirm: z.string().describe('Kirim "DELETE TODO <todoId> FROM TASK <taskId>".'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ taskId, todoId, confirm }) => {
      try {
        requireDestructiveEnabled();
        requireConfirm(confirm, `DELETE TODO ${todoId} FROM TASK ${taskId}`);
        await deleteTaskTodo(taskId, todoId);
        return ok({ deleted: true, taskId, todoId }, `Todo #${todoId} dihapus.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_delete',
    {
      title: 'Hapus task',
      description:
        'Hapus task permanen (cascade deskripsi/history/link/gambar). Butuh FAMILY_MCP_ENABLE_DESTRUCTIVE=true dan konfirmasi eksplisit.',
      inputSchema: {
        taskId: z.number().int().positive(),
        confirm: z.string().describe('Kirim "DELETE TASK <taskId>".'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ taskId, confirm }) => {
      try {
        requireDestructiveEnabled();
        requireConfirm(confirm, `DELETE TASK ${taskId}`);
        await deleteTask(taskId);
        return ok({ deleted: true, taskId }, `Task #${taskId} dihapus.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_create_workplace',
    {
      title: 'Buat tempat kerja',
      description: 'Buat workplace/tempat kerja untuk task.',
      inputSchema: {
        name: z.string().trim().min(1).max(120),
        employmentType: z.enum(employmentTypes),
        role: z.string().trim().max(120).nullable().optional(),
        location: z.string().trim().max(160).nullable().optional(),
        accent: z.string().trim().max(24).nullable().optional(),
        startedAt: z.string().nullable().optional(),
        endedAt: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      try {
        requireWriteEnabled();
        const workplace = await createWorkplace({
          name: input.name,
          employmentType: input.employmentType as EmploymentType,
          role: input.role,
          location: input.location,
          accent: input.accent,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
        });
        return ok(formatWorkplace(workplace), `Workplace "${workplace.name}" dibuat.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_update_workplace',
    {
      title: 'Update tempat kerja',
      description: 'Update partial workplace.',
      inputSchema: {
        workplaceId: z.number().int().positive(),
        name: z.string().trim().min(1).max(120).optional(),
        employmentType: z.enum(employmentTypes).optional(),
        role: z.string().trim().max(120).nullable().optional(),
        location: z.string().trim().max(160).nullable().optional(),
        accent: z.string().trim().max(24).nullable().optional(),
        startedAt: z.string().nullable().optional(),
        endedAt: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ workplaceId, ...input }) => {
      try {
        requireWriteEnabled();
        requireAtLeastOne(input, 'Isi minimal satu field workplace.');
        const workplace = await updateWorkplace(workplaceId, {
          name: input.name,
          employmentType: input.employmentType as EmploymentType | undefined,
          role: input.role,
          location: input.location,
          accent: input.accent,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
        });
        return ok(formatWorkplace(workplace), `Workplace #${workplaceId} diperbarui.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_archive_workplace',
    {
      title: 'Arsipkan tempat kerja',
      description:
        'Arsipkan workplace (soft delete). Task yang masih terkait tetap aman.',
      inputSchema: {
        workplaceId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ workplaceId }) => {
      try {
        requireWriteEnabled();
        const workplace = await archiveWorkplace(workplaceId);
        return ok(formatWorkplace(workplace), `Workplace #${workplaceId} diarsipkan.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_unarchive_workplace',
    {
      title: 'Pulihkan tempat kerja',
      description: 'Batalkan arsip workplace.',
      inputSchema: {
        workplaceId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ workplaceId }) => {
      try {
        requireWriteEnabled();
        const workplace = await unarchiveWorkplace(workplaceId);
        return ok(formatWorkplace(workplace), `Workplace #${workplaceId} dipulihkan.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'task_delete_workplace',
    {
      title: 'Hapus tempat kerja',
      description:
        'Hapus workplace permanen. API menolak 409 jika masih ada task terkait; arsipkan saja. Butuh flag destruktif + konfirmasi.',
      inputSchema: {
        workplaceId: z.number().int().positive(),
        confirm: z.string().describe('Kirim "DELETE WORKPLACE <workplaceId>".'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ workplaceId, confirm }) => {
      try {
        requireDestructiveEnabled();
        requireConfirm(confirm, `DELETE WORKPLACE ${workplaceId}`);
        await deleteWorkplace(workplaceId);
        return ok(
          { deleted: true, workplaceId },
          `Workplace #${workplaceId} dihapus.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );
}
