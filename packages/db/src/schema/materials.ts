// Learning materials (M12). Materials belong to a class and subject, not a year, so they carry
// over to the next academic year as-is (MAT-03).
import { foreignKey, index, pgEnum, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { classes, sections, subjects } from './academics.js';
import { files } from './homework.js';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';

export const materialType = pgEnum('material_type', ['link', 'file']);
/** MAT-02: staff = teachers only; students = students; everyone = students and parents. */
export const materialAudience = pgEnum('material_audience', ['staff', 'students', 'everyone']);

export const materials = pgTable(
  'materials',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    chapter: text(),
    title: text().notNull(),
    description: text(),
    type: materialType().notNull(),
    url: text(),
    fileId: uuid('file_id'),
    audience: materialAudience().notNull().default('everyone'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    unique('materials_id_institute').on(t.id, t.instituteId),
    foreignKey({ name: 'materials_class_fk', columns: [t.classId, t.instituteId], foreignColumns: [classes.id, classes.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'materials_subject_fk', columns: [t.subjectId, t.instituteId], foreignColumns: [subjects.id, subjects.instituteId] }),
    foreignKey({ name: 'materials_file_fk', columns: [t.fileId, t.instituteId], foreignColumns: [files.id, files.instituteId] }),
    index('materials_class_subject').on(t.classId, t.subjectId),
  ],
);

/** Optional restriction to some sections of the class; no rows = every section. */
export const materialSections = pgTable(
  'material_sections',
  {
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id').notNull(),
    sectionId: uuid('section_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.materialId, t.sectionId] }),
    foreignKey({ name: 'material_sections_material_fk', columns: [t.materialId, t.instituteId], foreignColumns: [materials.id, materials.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'material_sections_section_fk', columns: [t.sectionId, t.instituteId], foreignColumns: [sections.id, sections.instituteId] }).onDelete('cascade'),
  ],
);
