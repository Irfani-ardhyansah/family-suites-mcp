import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getAllFamilyPersons,
  getMe,
  getPerson,
  getTree,
  listPersons,
  type Person,
} from '../api/family.js';
import { formatPersonDetail, formatPersonSummary } from './format.js';
import { fail, ok } from './result.js';

type RelationName =
  | 'parents'
  | 'children'
  | 'siblings'
  | 'spouses'
  | 'grandparents'
  | 'grandchildren'
  | 'ancestors'
  | 'descendants'
  | 'in_laws';

type PersonGraph = {
  byId: Map<number, Person>;
  parentsOf: Map<number, Person[]>;
  childrenOf: Map<number, Person[]>;
  spousesOf: Map<number, Person[]>;
};

function buildGraph(persons: Person[]): PersonGraph {
  const byId = new Map(persons.map((person) => [person.id, person]));
  const parentsOf = new Map<number, Person[]>();
  const childrenOf = new Map<number, Person[]>();
  const spousesOf = new Map<number, Person[]>();

  const push = (map: Map<number, Person[]>, key: number, value: Person): void => {
    const list = map.get(key);
    if (list) {
      if (!list.some((item) => item.id === value.id)) list.push(value);
    } else {
      map.set(key, [value]);
    }
  };

  for (const person of persons) {
    const parents: Person[] = [];
    if (person.fatherId != null) {
      const father = byId.get(person.fatherId);
      if (father) {
        parents.push(father);
        push(childrenOf, father.id, person);
      }
    }
    if (person.motherId != null) {
      const mother = byId.get(person.motherId);
      if (mother) {
        parents.push(mother);
        push(childrenOf, mother.id, person);
      }
    }
    if (parents.length > 0) parentsOf.set(person.id, parents);
  }

  for (const person of persons) {
    for (const spouseId of person.spouseIds ?? []) {
      const spouse = byId.get(spouseId);
      if (!spouse) continue;
      push(spousesOf, person.id, spouse);
      push(spousesOf, spouse.id, person);
    }
  }

  return { byId, parentsOf, childrenOf, spousesOf };
}

function uniquePeople(people: Person[]): Person[] {
  return [...new Map(people.map((person) => [person.id, person])).values()];
}

function siblingsOf(graph: PersonGraph, person: Person): Person[] {
  return uniquePeople(
    [...graph.byId.values()].filter((candidate) => {
      if (candidate.id === person.id) return false;
      const sameFather =
        person.fatherId != null && candidate.fatherId === person.fatherId;
      const sameMother =
        person.motherId != null && candidate.motherId === person.motherId;
      return sameFather || sameMother;
    }),
  );
}

function ancestorsOf(
  graph: PersonGraph,
  startId: number,
  maxDepth = 8,
): Array<{ person: Person; depth: number }> {
  const result: Array<{ person: Person; depth: number }> = [];
  let frontier = [startId];
  const seen = new Set<number>([startId]);

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const parent of graph.parentsOf.get(id) ?? []) {
        if (seen.has(parent.id)) continue;
        seen.add(parent.id);
        result.push({ person: parent, depth });
        next.push(parent.id);
      }
    }
    frontier = next;
  }

  return result;
}

function descendantsOf(
  graph: PersonGraph,
  startId: number,
  maxDepth = 8,
): Array<{ person: Person; depth: number }> {
  const result: Array<{ person: Person; depth: number }> = [];
  let frontier = [startId];
  const seen = new Set<number>([startId]);

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const child of graph.childrenOf.get(id) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        result.push({ person: child, depth });
        next.push(child.id);
      }
    }
    frontier = next;
  }

  return result;
}

function depthLabel(prefix: string, depth: number): string {
  if (depth === 1) return prefix;
  if (depth === 2) return `grand${prefix}`;
  if (depth === 3) return `great_grand${prefix}`;
  return `${prefix}_${depth}_generations`;
}

function peopleWithRelation(
  people: Person[],
  relation: string,
  includeContact: boolean,
): Array<Record<string, unknown>> {
  return people.map((person) => ({
    relation,
    person: formatPersonSummary(person, includeContact),
  }));
}

function dedupeByPerson(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const seen = new Set<number>();
  const result: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const person = row.person as { id?: number } | undefined;
    if (person?.id == null || seen.has(person.id)) continue;
    seen.add(person.id);
    result.push(row);
  }
  return result;
}

function buildRelationGroups(
  graph: PersonGraph,
  person: Person,
  relations: RelationName[],
  includeContact: boolean,
): Record<string, Array<Record<string, unknown>>> {
  const groups: Record<string, Array<Record<string, unknown>>> = {};
  const parents = graph.parentsOf.get(person.id) ?? [];
  const children = graph.childrenOf.get(person.id) ?? [];
  const spouses = graph.spousesOf.get(person.id) ?? [];
  const siblings = siblingsOf(graph, person);

  for (const relation of relations) {
    switch (relation) {
      case 'parents':
        groups.parents = peopleWithRelation(parents, 'parent', includeContact);
        break;
      case 'children':
        groups.children = peopleWithRelation(children, 'child', includeContact);
        break;
      case 'siblings':
        groups.siblings = peopleWithRelation(siblings, 'sibling', includeContact);
        break;
      case 'spouses':
        groups.spouses = peopleWithRelation(spouses, 'spouse', includeContact);
        break;
      case 'grandparents': {
        const grandparents = uniquePeople(
          parents.flatMap((parent) => graph.parentsOf.get(parent.id) ?? []),
        );
        groups.grandparents = peopleWithRelation(
          grandparents,
          'grandparent',
          includeContact,
        );
        break;
      }
      case 'grandchildren': {
        const grandchildren = uniquePeople(
          children.flatMap((child) => graph.childrenOf.get(child.id) ?? []),
        );
        groups.grandchildren = peopleWithRelation(
          grandchildren,
          'grandchild',
          includeContact,
        );
        break;
      }
      case 'ancestors':
        groups.ancestors = ancestorsOf(graph, person.id).map((item) => ({
          relation: depthLabel('parent', item.depth),
          person: formatPersonSummary(item.person, includeContact),
        }));
        break;
      case 'descendants':
        groups.descendants = descendantsOf(graph, person.id).map((item) => ({
          relation: depthLabel('child', item.depth),
          person: formatPersonSummary(item.person, includeContact),
        }));
        break;
      case 'in_laws': {
        const siblingSpouses = siblings.flatMap(
          (sibling) => graph.spousesOf.get(sibling.id) ?? [],
        );
        const childSpouses = children.flatMap(
          (child) => graph.spousesOf.get(child.id) ?? [],
        );
        const spouseParents = spouses.flatMap(
          (spouse) => graph.parentsOf.get(spouse.id) ?? [],
        );
        const spouseSiblings = spouses.flatMap((spouse) =>
          siblingsOf(graph, spouse),
        );
        const rows = [
          ...peopleWithRelation(siblingSpouses, 'sibling_in_law', includeContact),
          ...peopleWithRelation(childSpouses, 'child_in_law', includeContact),
          ...peopleWithRelation(spouseParents, 'parent_in_law', includeContact),
          ...peopleWithRelation(spouseSiblings, 'sibling_in_law', includeContact),
        ];
        groups.in_laws = dedupeByPerson(rows);
        break;
      }
    }
  }

  return groups;
}

const RELATIONS: RelationName[] = [
  'parents',
  'children',
  'siblings',
  'spouses',
  'grandparents',
  'grandchildren',
  'ancestors',
  'descendants',
  'in_laws',
];

export function registerFamilyTools(server: McpServer): void {
  server.registerTool(
    'family_whoami',
    {
      title: 'Siapa saya?',
      description:
        'Identitas person pemilik token MCP, role, status modul, dan fokus baca. Pakai ini untuk validasi token.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const me = await getMe();
        return ok({
          person: {
            id: me.id,
            fullName: me.fullName,
            nickname: me.nickname,
            gender: me.gender,
            birthDate: me.birthDate,
            status: me.status,
            photoUrl: me.photoUrl,
          },
          familyId: me.familyId,
          role: me.role,
          isAdmin: me.isAdmin,
          spouseIds: me.spouseIds,
          allowedFocusPersons: me.allowedFocusPersons,
          readFocusPersonId: me.readFocusPersonId,
          moduleStatuses: me.moduleStatuses ?? [],
          secondaryPassword: me.secondaryPassword
            ? {
                isSet: me.secondaryPassword.isSet,
                mustSetup: me.secondaryPassword.mustSetup,
                unlocks: me.secondaryPassword.unlocks,
              }
            : null,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'family_search_people',
    {
      title: 'Cari anggota keluarga',
      description:
        'Cari person di family berdasarkan nama/nickname dan gender. Mengembalikan ringkasan; gunakan family_get_person untuk detail.',
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(120)
          .optional()
          .describe('Nama atau nickname. Pencarian per kata, bukan potongan huruf.'),
        gender: z.enum(['male', 'female']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        includeContact: z
          .boolean()
          .optional()
          .describe('Sertakan phone/address. Default false.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, gender, limit, includeContact }) => {
      try {
        const data = await listPersons({
          query,
          gender,
          limit: limit ?? 20,
          scope: 'family',
        });
        const persons = (data.persons ?? []).map((person) =>
          formatPersonSummary(person, includeContact ?? false),
        );
        return ok(
          {
            count: persons.length,
            persons,
            pagination: data.pagination ?? null,
          },
          `Ditemukan ${persons.length} person.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'family_get_person',
    {
      title: 'Detail person',
      description:
        'Ambil detail satu person: data diri, orang tua, pasangan, dan (opsional) kontak.',
      inputSchema: {
        personId: z.number().int().positive(),
        includeContact: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ personId, includeContact }) => {
      try {
        const person = await getPerson(personId);
        return ok(formatPersonDetail(person, includeContact ?? false));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'family_get_relations',
    {
      title: 'Relasi keluarga',
      description:
        'Hitung relasi person dari graph family: orang tua, anak, saudara, pasangan, kakek/nenek, cucu, leluhur, keturunan, dan ipar. Tidak ada tool tulis Family Roots.',
      inputSchema: {
        personId: z.number().int().positive(),
        relations: z
          .array(z.enum(RELATIONS as [RelationName, ...RelationName[]]))
          .optional()
          .describe('Default semua relasi. Isi subset untuk respons lebih kecil.'),
        includeContact: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ personId, relations, includeContact }) => {
      try {
        const persons = await getAllFamilyPersons();
        const graph = buildGraph(persons);
        const person = graph.byId.get(personId);
        if (!person) {
          return ok(
            {
              found: false,
              personId,
              message:
                'Person tidak ditemukan di family. Coba family_search_people dulu.',
            },
            'Person tidak ditemukan.',
          );
        }

        const selected = relations && relations.length > 0 ? relations : RELATIONS;
        const groups = buildRelationGroups(
          graph,
          person,
          selected,
          includeContact ?? false,
        );

        return ok({
          person: formatPersonSummary(person, includeContact ?? false),
          relations: groups,
          counts: Object.fromEntries(
            Object.entries(groups).map(([key, value]) => [key, value.length]),
          ),
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'family_get_tree',
    {
      title: 'Graph pohon keluarga',
      description:
        'Ambil graph pohon keluarga (flat persons + treeGraph). Fokus default adalah person pemilik token; fokus lain hanya diri sendiri atau pasangan.',
      inputSchema: {
        focusPersonId: z.number().int().positive().optional(),
        includeContact: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ focusPersonId, includeContact }) => {
      try {
        const data = await getTree(focusPersonId);
        const persons = (data.persons ?? []).map((person) =>
          formatPersonSummary(person, includeContact ?? false),
        );
        return ok({
          focusPersonId: data.focusPersonId ?? focusPersonId ?? null,
          allowedFocusPersonIds: data.allowedFocusPersonIds ?? [],
          selfPersonId: data.selfPersonId ?? null,
          persons,
          treeGraph: data.treeGraph ?? null,
          meta: data.meta ?? null,
        });
      } catch (error) {
        return fail(error);
      }
    },
  );
}
