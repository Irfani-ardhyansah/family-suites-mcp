import { apiGet } from './client.js';

export type PersonGender = 'male' | 'female';

export type Person = {
  id: number;
  fullName: string;
  nickname: string | null;
  gender: PersonGender | string;
  birthDate: string | null;
  deathDate: string | null;
  status: 'alive' | 'deceased' | string;
  religion?: string | null;
  photoUrl?: string | null;
  occupation?: string | null;
  phone?: string | null;
  phoneAlt?: string | null;
  address?: unknown;
  fatherId: number | null;
  motherId: number | null;
  spouseIds: number[];
  generationLabel?: string | null;
  isSelf?: boolean;
  role?: 'admin' | 'member' | string | null;
};

export type PersonPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type PersonListData = {
  persons?: Person[];
  pagination?: PersonPagination;
  focusPersonId?: number;
  allowedFocusPersonIds?: number[];
  selfPersonId?: number;
  treeGraph?: unknown;
  meta?: Record<string, unknown>;
};

export type PersonDetail = Person & {
  focusPersonId?: number;
  allowedFocusPersonIds?: number[];
};

export type AuthModuleStatus = {
  moduleId: string;
  enabled: boolean;
};

export type AuthMe = {
  id: number;
  fullName: string;
  nickname: string | null;
  gender: PersonGender | string;
  birthDate: string;
  status: 'alive' | 'deceased' | string;
  photoUrl: string | null;
  role: 'admin' | 'member' | string;
  isAdmin: boolean;
  isMarried: boolean;
  isLegal: boolean;
  spouseIds: number[];
  allowedFocusPersons: Array<{
    id: number;
    fullName: string;
    nickname: string | null;
    gender: PersonGender | string;
    photoUrl: string | null;
    relation: 'self' | 'spouse' | string;
  }>;
  familyId: number;
  readFocusPersonId?: number;
  allowedFocusPersonIds?: number[];
  accessVersion?: number;
  moduleStatuses?: AuthModuleStatus[];
  secondaryPassword?: {
    isSet: boolean;
    mustSetup: boolean;
    unlocks: string[];
  };
};

export type ListPersonsParams = {
  query?: string;
  gender?: PersonGender;
  page?: number;
  limit?: number;
  scope?: 'branch' | 'family';
};

export async function getMe(): Promise<AuthMe> {
  return apiGet<AuthMe>('/auth/me');
}

export async function listPersons(
  params: ListPersonsParams = {},
): Promise<PersonListData> {
  return apiGet<PersonListData>('/persons', {
    scope: params.scope ?? 'family',
    q: params.query,
    gender: params.gender,
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  });
}

/**
 * Ambil semua person aktif di family. Dipakai relation engine dan resolver nama.
 * API membatasi `limit` 100 per halaman.
 */
export async function getAllFamilyPersons(): Promise<Person[]> {
  const byId = new Map<number, Person>();
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const data = await listPersons({ scope: 'family', page, limit: 100 });
    const persons = Array.isArray(data.persons) ? data.persons : [];
    for (const person of persons) {
      byId.set(person.id, person);
    }

    if (persons.length === 0 || data.pagination?.hasNext !== true) break;
    page += 1;
  }

  return [...byId.values()];
}

export async function getPerson(
  personId: number,
  focusPersonId?: number,
): Promise<PersonDetail> {
  return apiGet<PersonDetail>(`/persons/${personId}`, { focusPersonId });
}

export async function getTree(focusPersonId?: number): Promise<PersonListData> {
  return apiGet<PersonListData>('/persons', {
    view: 'tree',
    focusPersonId,
  });
}
