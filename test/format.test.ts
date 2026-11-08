import { describe, expect, it } from 'vitest';
import type { Person } from '../src/api/family.js';
import type { Task } from '../src/api/task.js';
import {
  ageFromBirthDate,
  formatPersonSummary,
  formatTaskSummary,
  stripHtml,
} from '../src/tools/format.js';

const person: Person = {
  id: 83,
  fullName: 'Mochamad Irfani Ardhyansah',
  nickname: 'Irfan',
  gender: 'male',
  birthDate: '1999-03-21',
  deathDate: null,
  status: 'alive',
  fatherId: 12,
  motherId: 13,
  spouseIds: [84],
  occupation: 'Software Engineer',
  phone: '+6281234567890',
  address: { city: 'Malang' },
};

const task: Task = {
  id: 12,
  person_id: 83,
  type: 'Feature',
  title: 'Tambah filter status',
  branch_name: 'feature/filter-status',
  status: 'To-Do',
  descriptions: [
    { id: 1, title: 'Konteks', content: '<p>Filter <strong>status</strong></p>' },
  ],
  description: '<p>Filter <strong>status</strong></p>',
  deploy_notes: null,
  migration_files: [],
  parent_task_id: null,
  workplace_id: 1,
  sort_order: 0,
  links: [],
  images: [],
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-02T00:00:00.000Z',
};

describe('ageFromBirthDate', () => {
  it('menghitung umur dengan aman di batas ulang tahun', () => {
    expect(ageFromBirthDate('1999-03-21', new Date('2026-03-20T00:00:00Z'))).toBe(26);
    expect(ageFromBirthDate('1999-03-21', new Date('2026-03-21T00:00:00Z'))).toBe(27);
  });

  it('mengembalikan null untuk tanggal kosong/invalid', () => {
    expect(ageFromBirthDate(null)).toBeNull();
    expect(ageFromBirthDate('bukan-tanggal')).toBeNull();
  });
});

describe('formatPersonSummary', () => {
  it('menyembunyikan kontak secara default', () => {
    const summary = formatPersonSummary(person);
    expect(summary).toMatchObject({
      id: 83,
      fullName: 'Mochamad Irfani Ardhyansah',
      nickname: 'Irfan',
    });
    expect(summary).not.toHaveProperty('phone');
    expect(summary).not.toHaveProperty('address');
  });

  it('menyertakan kontak jika diminta', () => {
    const summary = formatPersonSummary(person, true);
    expect(summary).toMatchObject({
      phone: '+6281234567890',
      address: { city: 'Malang' },
    });
  });
});

describe('formatTaskSummary', () => {
  it('memakai nama field yang ramah LLM dan preview teks', () => {
    const summary = formatTaskSummary(task);
    expect(summary).toMatchObject({
      id: 12,
      branchName: 'feature/filter-status',
      status: 'To-Do',
      descriptionTitles: ['Konteks'],
    });
    expect(summary.descriptionPreview).toBe('Filter status');
  });
});

describe('stripHtml', () => {
  it('membersihkan tag dan entity umum', () => {
    expect(stripHtml('<p>Halo&nbsp;<b>dunia</b> &amp; semua</p>')).toBe(
      'Halo dunia & semua',
    );
  });
});
