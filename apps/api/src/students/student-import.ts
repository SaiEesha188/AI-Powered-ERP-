// Bulk admission from a spreadsheet (CFG-07). Parsing and row validation are pure functions so
// they can be tested without a database; StudentImportService does the lookups and the writes.
import { academicYears, classes, enrollments, eq, sections, students, type Tx } from '@erp/db';
import { type AdmitStudentInput, AppError, GUARDIAN_RELATIONS, type GuardianInput, phoneSchema } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { TenantDb } from '../core/core.module.js';
import { StudentsService } from './students.service.js';

export const IMPORT_COLUMNS = [
  'admission_no',
  'name',
  'dob',
  'gender',
  'class',
  'section',
  'roll_no',
  'guardian_name',
  'guardian_phone',
  'guardian_relation',
  'guardian_whatsapp_opt_in',
  'guardian2_name',
  'guardian2_phone',
  'guardian2_relation',
] as const;

export type ImportRow = Record<string, string>;
export interface RowError {
  row: number;
  column: string;
  message: string;
}

const MAX_ROWS = 5000;

// --- parsing ---

/** RFC 4180 CSV: quoted fields, escaped quotes, CRLF or LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (r) => {
    const values: string[] = [];
    for (let col = 1; col <= r.cellCount; col++) values.push(cellText(r.getCell(col).value));
    rows.push(values);
  });
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
  }
  return String(value);
}

export async function readSheet(file: { buffer: Buffer; originalname: string }): Promise<ImportRow[]> {
  const isXlsx = /\.xlsx$/i.test(file.originalname);
  if (!isXlsx && !/\.csv$/i.test(file.originalname)) throw new AppError('invalid', 'Upload a .csv or .xlsx file');
  const grid = isXlsx ? await parseXlsx(file.buffer) : parseCsv(file.buffer.toString('utf8'));
  const [header, ...body] = grid;
  if (!header) throw new AppError('invalid', 'The file is empty');
  if (body.length > MAX_ROWS) throw new AppError('invalid', `At most ${MAX_ROWS} rows per file`);
  const keys = header.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  for (const required of ['name', 'guardian_name', 'guardian_phone']) {
    if (!keys.includes(required)) throw new AppError('invalid', `Missing column: ${required}. Expected: ${IMPORT_COLUMNS.join(', ')}`);
  }
  return body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}

// --- normalising ---

/** Accepts 10-digit Indian numbers with or without 0/91 prefixes, or full international format. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, '');
  let candidate = digits;
  if (/^[6-9]\d{9}$/.test(digits)) candidate = `+91${digits}`;
  else if (/^0[6-9]\d{9}$/.test(digits)) candidate = `+91${digits.slice(1)}`;
  else if (/^91[6-9]\d{9}$/.test(digits)) candidate = `+${digits}`;
  return phoneSchema.safeParse(candidate).success ? candidate : null;
}

/** YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY (Indian day-first convention). */
export function normaliseDate(raw: string): string | null {
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const GENDERS: Record<string, 'male' | 'female' | 'other'> = { m: 'male', male: 'male', boy: 'male', f: 'female', female: 'female', girl: 'female', other: 'other', o: 'other' };
const YES = new Set(['y', 'yes', 'true', '1']);

export interface SchoolLookup {
  /** "class name|section name" (lower-case) → section id in the current year. */
  sections: Map<string, string>;
  existingAdmissionNos: Set<string>;
  /** "sectionId|roll" already taken. */
  takenRolls: Set<string>;
}

/** Validates every row and converts the valid ones into admission inputs. */
export function validateRows(rows: ImportRow[], lookup: SchoolLookup) {
  const errors: RowError[] = [];
  const admissions: AdmitStudentInput[] = [];
  const seenAdmissionNos = new Map<string, number>();
  const seenRolls = new Map<string, number>();

  rows.forEach((r, index) => {
    const rowNo = index + 2; // 1-based, after the header row
    const fail = (column: string, message: string) => errors.push({ row: rowNo, column, message });
    const before = errors.length;

    const name = r.name ?? '';
    if (name.length < 2) fail('name', 'Name is required');

    const admissionNo = r.admission_no || undefined;
    if (admissionNo) {
      if (!/^[A-Za-z0-9/_-]{1,30}$/.test(admissionNo)) fail('admission_no', 'Letters, digits, / _ - only (max 30)');
      else if (lookup.existingAdmissionNos.has(admissionNo)) fail('admission_no', 'Already used by an existing student');
      else if (seenAdmissionNos.has(admissionNo)) fail('admission_no', `Duplicate of row ${seenAdmissionNos.get(admissionNo)}`);
      else seenAdmissionNos.set(admissionNo, rowNo);
    }

    const dob = r.dob ? normaliseDate(r.dob) : null;
    if (r.dob && !dob) fail('dob', 'Use YYYY-MM-DD or DD/MM/YYYY');
    const gender = r.gender ? GENDERS[r.gender.toLowerCase()] : undefined;
    if (r.gender && !gender) fail('gender', 'Use male, female or other');

    let sectionId: string | undefined;
    if (r.class || r.section) {
      sectionId = lookup.sections.get(`${(r.class ?? '').toLowerCase()}|${(r.section ?? '').toLowerCase()}`);
      if (!sectionId) fail('section', `No section "${r.class} ${r.section}" in the current academic year`);
    }
    let rollNo: number | undefined;
    if (r.roll_no) {
      rollNo = Number(r.roll_no);
      if (!Number.isInteger(rollNo) || rollNo < 1 || rollNo > 9999) fail('roll_no', 'Whole number from 1 to 9999');
      else if (!sectionId) fail('roll_no', 'Roll number needs a class and section');
      else {
        const key = `${sectionId}|${rollNo}`;
        if (lookup.takenRolls.has(key)) fail('roll_no', 'Already taken in this section');
        else if (seenRolls.has(key)) fail('roll_no', `Duplicate of row ${seenRolls.get(key)}`);
        else seenRolls.set(key, rowNo);
      }
    }

    const guardians: GuardianInput[] = [];
    for (const prefix of ['guardian', 'guardian2']) {
      const gName = r[`${prefix}_name`] ?? '';
      const gPhone = r[`${prefix}_phone`] ?? '';
      if (prefix === 'guardian2' && !gName && !gPhone) continue;
      if (gName.length < 2) fail(`${prefix}_name`, 'Guardian name is required');
      const phone = normalisePhone(gPhone);
      if (!phone) fail(`${prefix}_phone`, 'Not a valid mobile number');
      const relationRaw = (r[`${prefix}_relation`] || 'guardian').toLowerCase();
      const relation = (GUARDIAN_RELATIONS as readonly string[]).includes(relationRaw) ? (relationRaw as GuardianInput['relation']) : null;
      if (!relation) fail(`${prefix}_relation`, `Use one of: ${GUARDIAN_RELATIONS.join(', ')}`);
      if (phone && relation) {
        guardians.push({
          name: gName,
          phone,
          relation,
          isPrimary: prefix === 'guardian',
          whatsappOptIn: prefix === 'guardian' && YES.has((r.guardian_whatsapp_opt_in ?? '').toLowerCase()),
          language: 'en',
        });
      }
    }
    if (guardians.length === 2 && guardians[0]!.phone === guardians[1]!.phone) fail('guardian2_phone', 'Same number as the first guardian');

    if (errors.length === before) {
      admissions.push({ name, admissionNo, dob, gender, sectionId, rollNo, guardians, customFields: {} });
    }
  });
  return { admissions, errors };
}

export function errorsToCsv(errors: RowError[]) {
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return ['row,column,message', ...errors.map((e) => [e.row, e.column, e.message].map(esc).join(','))].join('\n');
}

@Injectable()
export class StudentImportService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly studentsService: StudentsService,
  ) {}

  /** Validates the whole file; imports only if every row is valid (all-or-nothing). */
  async import(file: { buffer: Buffer; originalname: string }, dryRun: boolean) {
    const rows = await readSheet(file);
    const lookup = await this.tenantDb.run((tx) => this.loadLookup(tx));
    const { admissions, errors } = validateRows(rows, lookup);
    const report = { total: rows.length, valid: admissions.length, errors, errorCsv: errors.length ? errorsToCsv(errors) : null, imported: 0, dryRun };
    if (dryRun || errors.length) return report;

    const identities = await this.studentsService.resolveGuardians(admissions.flatMap((a) => a.guardians));
    await this.tenantDb.run(async (tx) => {
      for (const admission of admissions) await this.studentsService.admitInTx(tx, admission, identities);
    });
    return { ...report, imported: admissions.length };
  }

  private async loadLookup(tx: Tx): Promise<SchoolLookup> {
    const rows = await tx
      .select({ id: sections.id, section: sections.name, className: classes.name })
      .from(sections)
      .innerJoin(classes, eq(classes.id, sections.classId))
      .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
      .where(eq(academicYears.isCurrent, true));
    const existing = await tx.select({ no: students.admissionNo }).from(students);
    const rolls = await tx
      .select({ sectionId: enrollments.sectionId, rollNo: enrollments.rollNo })
      .from(enrollments)
      .innerJoin(academicYears, eq(academicYears.id, enrollments.academicYearId))
      .where(eq(academicYears.isCurrent, true));
    return {
      sections: new Map(rows.map((s) => [`${s.className.toLowerCase()}|${s.section.toLowerCase()}`, s.id])),
      existingAdmissionNos: new Set(existing.map((s) => s.no)),
      takenRolls: new Set(rolls.filter((r) => r.rollNo !== null).map((r) => `${r.sectionId}|${r.rollNo}`)),
    };
  }
}

