// Request schemas shared by the API (validation) and the web/mobile clients (forms).
import { z } from 'zod';
import { PERMISSIONS, type PermissionCode } from './permissions.js';
import { VERTICALS } from './vertical-packs.js';

export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210');
const dateSchema = z.iso.date();
const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM, 24-hour');
const permissionCodes = PERMISSIONS.map((p) => p.code) as [PermissionCode, ...PermissionCode[]];

// --- auth ---
export const otpRequestSchema = z.object({ phone: phoneSchema });
export const otpVerifySchema = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) });
export const passwordLoginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(8).max(200),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(200) });

// --- platform ---
export const createTenantSchema = z.object({
  organization: z.object({
    name: z.string().trim().min(2).max(200),
    type: z.enum(['trust', 'chain', 'coaching', 'college', 'company', 'other']),
  }),
  institute: z.object({
    name: z.string().trim().min(2).max(200),
    vertical: z.enum(VERTICALS),
    board: z.string().trim().max(50).optional(),
    subdomain: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, 'Lowercase letters, digits and hyphens'),
  }),
  planCode: z.string().min(1).max(50),
  seats: z.int().min(1).max(1_000_000),
  admin: z.object({ name: z.string().trim().min(2).max(200), phone: phoneSchema }),
});

// --- institute settings ---
export const updateInstituteSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    board: z.string().trim().max(50).nullable(),
    terminology: z
      .object({
        class: z.string().trim().min(1).max(40),
        section: z.string().trim().min(1).max(40),
        homework: z.string().trim().min(1).max(40),
        student: z.string().trim().min(1).max(40),
        teacher: z.string().trim().min(1).max(40),
        exam: z.string().trim().min(1).max(40),
      })
      .partial(),
    branding: z
      .object({
        logoUrl: z.url().max(500),
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        reportCardHeader: z.string().max(300),
        whatsappSenderName: z.string().max(60),
      })
      .partial(),
    workingDays: z
      .array(z.int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((d) => new Set(d).size === d.length, 'Each day once'),
    holidayApprovalRequired: z.boolean(),
    homeworkDigestTime: timeOfDaySchema,
    attendanceCutoffTime: timeOfDaySchema,
    circularApprovalRequired: z.boolean(),
  })
  .partial();

// --- roles & users ---
export const roleCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{1,49}$/);
export const createRoleSchema = z.object({
  code: roleCodeSchema,
  name: z.string().trim().min(2).max(80),
  permissions: z.array(z.enum(permissionCodes)).max(PERMISSIONS.length),
});
export const setRolePermissionsSchema = z.object({ permissions: createRoleSchema.shape.permissions });

export const addUserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: phoneSchema,
  roles: z.array(roleCodeSchema).min(1).max(10),
});
export const assignRoleSchema = z.object({ role: roleCodeSchema });

// --- calendar ---
const endAfterStart = (v: { startDate: string; endDate: string }) => v.endDate > v.startDate;
const endAfterStartError = { message: 'endDate must be after startDate', path: ['endDate'] };

export const createAcademicYearSchema = z
  .object({ name: z.string().trim().min(2).max(50), startDate: dateSchema, endDate: dateSchema })
  .refine(endAfterStart, endAfterStartError);
export const updateAcademicYearSchema = createAcademicYearSchema;
export const createTermSchema = z
  .object({ name: z.string().trim().min(1).max(50), startDate: dateSchema, endDate: dateSchema })
  .refine(endAfterStart, endAfterStartError);

// --- staff (M06) ---
const staffFields = {
  employeeCode: z.string().trim().min(1).max(30).nullable(),
  designation: z.string().trim().min(2).max(80),
  joiningDate: dateSchema.nullable(),
};
export const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: phoneSchema,
  roles: z.array(roleCodeSchema).min(1).max(10).default(['teacher']),
  ...staffFields,
  employeeCode: staffFields.employeeCode.optional(),
  joiningDate: staffFields.joiningDate.optional(),
});
export const updateStaffSchema = z.object({ ...staffFields, status: z.enum(['active', 'left']) }).partial();

// --- academic structure (M07) ---
const shortName = z.string().trim().min(1).max(50);
export const createClassSchema = z.object({ name: shortName, level: z.int().min(-5).max(30) });
export const updateClassSchema = createClassSchema.partial();
export const setClassSubjectsSchema = z.object({
  subjects: z
    .array(z.object({ subjectId: z.uuid(), periodsPerWeek: z.int().min(0).max(60).nullable().default(null) }))
    .max(50)
    .refine((list) => new Set(list.map((s) => s.subjectId)).size === list.length, 'Each subject may appear once'),
});
export const createSubjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/),
  type: z.enum(['scholastic', 'co_scholastic', 'elective']).default('scholastic'),
});
export const updateSubjectSchema = createSubjectSchema.partial();
export const createSectionSchema = z.object({
  classId: z.uuid(),
  /** Defaults to the current academic year. */
  academicYearId: z.uuid().optional(),
  name: z.string().trim().min(1).max(20),
  classTeacherId: z.uuid().nullable().optional(),
});
export const updateSectionSchema = z
  .object({ name: createSectionSchema.shape.name, classTeacherId: z.uuid().nullable() })
  .partial();
export const createAssignmentSchema = z.object({ staffId: z.uuid(), subjectId: z.uuid() });
export const listSectionsQuerySchema = z.object({ academicYearId: z.uuid().optional(), classId: z.uuid().optional() });

// --- students and guardians (M05) ---
export const GUARDIAN_RELATIONS = ['mother', 'father', 'guardian', 'other'] as const;
export const languageSchema = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Language code such as en or hi');
export const guardianInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: phoneSchema,
  relation: z.enum(GUARDIAN_RELATIONS),
  isPrimary: z.boolean().default(false),
  whatsappOptIn: z.boolean().default(false),
  language: languageSchema.default('en'),
});
const studentFields = {
  name: z.string().trim().min(2).max(200),
  admissionNo: z.string().trim().regex(/^[A-Za-z0-9/_-]{1,30}$/),
  dob: dateSchema.nullable(),
  gender: z.enum(['male', 'female', 'other']).nullable(),
  admissionDate: dateSchema.nullable(),
  medicalNotes: z.string().trim().max(2000).nullable(),
  customFields: z.record(z.string().max(50), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])),
};
export const admitStudentSchema = z
  .object({
    ...studentFields,
    admissionNo: studentFields.admissionNo.optional(),
    dob: studentFields.dob.optional(),
    gender: studentFields.gender.optional(),
    admissionDate: studentFields.admissionDate.optional(),
    medicalNotes: studentFields.medicalNotes.optional(),
    customFields: studentFields.customFields.default({}),
    /** Enrolls in this section (and its academic year) straight away. */
    sectionId: z.uuid().optional(),
    rollNo: z.int().positive().max(9999).optional(),
    guardians: z.array(guardianInputSchema).min(1).max(4),
  })
  .refine((s) => s.guardians.filter((g) => g.isPrimary).length <= 1, { message: 'Only one primary guardian', path: ['guardians'] })
  .refine((s) => new Set(s.guardians.map((g) => g.phone)).size === s.guardians.length, {
    message: 'Each guardian needs a different phone number',
    path: ['guardians'],
  });
export const updateStudentSchema = z
  .object({ ...studentFields, status: z.enum(['active', 'left', 'alumni']) })
  .partial();
export const updateGuardianLinkSchema = z
  .object({
    relation: z.enum(GUARDIAN_RELATIONS),
    isPrimary: z.literal(true),
    whatsappOptIn: z.boolean(),
    language: languageSchema,
  })
  .partial();
export const enrollSchema = z.object({ sectionId: z.uuid(), rollNo: z.int().positive().max(9999).nullable().optional() });
export const listStudentsQuerySchema = z.object({
  sectionId: z.uuid().optional(),
  classId: z.uuid().optional(),
  status: z.enum(['active', 'left', 'alumni']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GuardianInput = z.infer<typeof guardianInputSchema>;
export type AdmitStudentInput = z.infer<typeof admitStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type UpdateGuardianLinkInput = z.infer<typeof updateGuardianLinkSchema>;
export type EnrollInput = z.infer<typeof enrollSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type SetClassSubjectsInput = z.infer<typeof setClassSubjectsSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type ListSectionsQuery = z.infer<typeof listSectionsQuerySchema>;

// --- holidays and events (CAL-03..06) ---
export const CALENDAR_EVENT_TYPES = ['holiday', 'half_day', 'event', 'exam', 'ptm'] as const;
export const createCalendarEventSchema = z
  .object({
    type: z.enum(CALENDAR_EVENT_TYPES),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    startDate: dateSchema,
    endDate: dateSchema,
    /** all = everyone; classes = only classIds; staff = staff only (e.g. a training day). */
    scope: z.enum(['all', 'classes', 'staff']).default('all'),
    classIds: z.array(z.uuid()).max(100).default([]),
  })
  .refine((e) => e.endDate >= e.startDate, { message: 'endDate cannot be before startDate', path: ['endDate'] })
  .refine((e) => (e.scope === 'classes') === e.classIds.length > 0, { message: 'classIds are required exactly when scope is classes', path: ['classIds'] });
export const listCalendarQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((q) => q.to >= q.from, { message: 'to cannot be before from', path: ['to'] });
export const decideEventSchema = z.object({ decision: z.enum(['approve', 'reject']) });
export const dayStatusQuerySchema = z.object({ date: dateSchema, classId: z.uuid() });

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type ListCalendarQuery = z.infer<typeof listCalendarQuerySchema>;

// --- attendance (M08) ---
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'half_day', 'leave'] as const;
export const markAttendanceSchema = z.object({
  date: dateSchema,
  /** Exceptions only: every other enrolled student is saved as present (ATT-02). */
  records: z
    .array(z.object({ studentId: z.uuid(), status: z.enum(ATTENDANCE_STATUSES), remark: z.string().trim().max(200).optional() }))
    .max(500)
    .refine((r) => new Set(r.map((x) => x.studentId)).size === r.length, 'Each student once'),
  /** When the teacher actually took attendance, for captures synced later from offline (ATT-03). */
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  /** Required for corrections after the edit window (ATT-05). */
  reason: z.string().trim().min(3).max(500).optional(),
});
export const attendanceDateQuerySchema = z.object({ date: dateSchema });
export const monthQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM') });
export const defaultersQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    threshold: z.coerce.number().min(1).max(100).default(75),
    sectionId: z.uuid().optional(),
  })
  .refine((q) => q.to >= q.from, { message: 'to cannot be before from', path: ['to'] });

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type DefaultersQuery = z.infer<typeof defaultersQuerySchema>;

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateInstituteSettingsInput = z.infer<typeof updateInstituteSettingsSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AddUserInput = z.infer<typeof addUserSchema>;
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type CreateTermInput = z.infer<typeof createTermSchema>;

// --- notifications (M15) ---
export const updateAutomationRuleSchema = z.object({ enabled: z.boolean(), timing: z.enum(['immediate', 'digest']) });
export const listDeliveriesQuerySchema = z.object({
  eventType: z.string().max(50).optional(),
  status: z.enum(['queued', 'sent', 'delivered', 'read', 'failed', 'skipped']).optional(),
  /** Cursor: createdAt of the last row of the previous page. */
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export const usageQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM') });

export type UpdateAutomationRuleInput = z.infer<typeof updateAutomationRuleSchema>;
export type ListDeliveriesQuery = z.infer<typeof listDeliveriesQuerySchema>;

// --- homework (M11) ---
export const homeworkLinkSchema = z.object({ url: z.url().max(500), label: z.string().trim().max(100).optional() });
export const createHomeworkSchema = z.object({
  /** HW-01: post once to several sections. */
  sectionIds: z.array(z.uuid()).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'Each section once'),
  subjectId: z.uuid(),
  title: z.string().trim().min(2).max(200),
  instructions: z.string().trim().max(4000).optional(),
  dueDate: dateSchema,
  isUrgent: z.boolean().default(false),
  links: z.array(homeworkLinkSchema).max(10).default([]),
  fileIds: z.array(z.uuid()).max(10).default([]),
});
export const updateHomeworkSchema = z
  .object({ title: createHomeworkSchema.shape.title, instructions: z.string().trim().max(4000).nullable(), dueDate: dateSchema })
  .partial();
export const listHomeworkQuerySchema = z.object({
  sectionId: z.uuid().optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  /** Only homework the caller posted. */
  mine: z.enum(['true', 'false']).optional(),
});
export const homeworkCompletionSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.uuid(),
        status: z.enum(['done', 'pending', 'late']),
        feedback: z.string().trim().max(1000).optional(),
        score: z.number().min(0).max(1000).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export const dateRangeQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((q) => q.to >= q.from, { message: 'to cannot be before from', path: ['to'] });

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;
export type ListHomeworkQuery = z.infer<typeof listHomeworkQuerySchema>;
export type HomeworkCompletionInput = z.infer<typeof homeworkCompletionSchema>;

// --- learning materials (M12) ---
const materialFields = {
  chapter: z.string().trim().min(1).max(100).nullable(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable(),
  audience: z.enum(['staff', 'students', 'everyone']),
  sectionIds: z.array(z.uuid()).max(50),
};
export const createMaterialSchema = z
  .object({
    classId: z.uuid(),
    subjectId: z.uuid(),
    ...materialFields,
    chapter: materialFields.chapter.optional(),
    description: materialFields.description.optional(),
    audience: materialFields.audience.default('everyone'),
    sectionIds: materialFields.sectionIds.default([]),
    type: z.enum(['link', 'file']),
    url: z.url().max(500).optional(),
    fileId: z.uuid().optional(),
  })
  .refine((m) => (m.type === 'link' ? Boolean(m.url) && !m.fileId : Boolean(m.fileId) && !m.url), {
    message: 'A link needs url; a file needs fileId',
    path: ['type'],
  });
export const updateMaterialSchema = z.object(materialFields).partial();
export const listMaterialsQuerySchema = z.object({ classId: z.uuid().optional(), subjectId: z.uuid().optional(), chapter: z.string().max(100).optional() });
export const familyMaterialsQuerySchema = z.object({ subjectId: z.uuid().optional() });

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type ListMaterialsQuery = z.infer<typeof listMaterialsQuerySchema>;

// --- circulars and notices (COM-01, COM-03) ---
export const audienceSchema = z
  .object({ type: z.enum(['all', 'staff', 'parents', 'class', 'section', 'user']), refId: z.uuid().optional() })
  .refine((a) => ['class', 'section', 'user'].includes(a.type) === Boolean(a.refId), { message: 'refId is required exactly for class, section and user', path: ['refId'] });
export const createCircularSchema = z.object({
  type: z.enum(['circular', 'notice']).default('circular'),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(10_000),
  /** COM-03: recipients must tap "I agree". */
  requiresAck: z.boolean().default(false),
  audiences: z.array(audienceSchema).min(1).max(50),
  fileIds: z.array(z.uuid()).max(10).default([]),
  /** Publish straight away instead of saving a draft. */
  publish: z.boolean().default(false),
});
export const listCircularsQuerySchema = z.object({ status: z.enum(['draft', 'pending_approval', 'published']).optional() });

export type CreateCircularInput = z.infer<typeof createCircularSchema>;
export type AudienceInput = z.infer<typeof audienceSchema>;

// --- reports and dashboards (M17) ---
export const exportFormatSchema = z.enum(['json', 'csv', 'xlsx']).default('json');
export const registerReportQuerySchema = z.object({ sectionId: z.uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM'), format: exportFormatSchema });
export const defaultersReportQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    threshold: z.coerce.number().min(1).max(100).default(75),
    sectionId: z.uuid().optional(),
    format: exportFormatSchema,
  })
  .refine((q) => q.to >= q.from, { message: 'to cannot be before from', path: ['to'] });
export const studentsReportQuerySchema = z.object({ sectionId: z.uuid().optional(), classId: z.uuid().optional(), format: exportFormatSchema });
export const reachReportQuerySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM'), format: exportFormatSchema });
export const homeworkReportQuerySchema = z
  .object({ from: dateSchema, to: dateSchema, format: exportFormatSchema })
  .refine((q) => q.to >= q.from, { message: 'to cannot be before from', path: ['to'] });
export const dashboardDateQuerySchema = z.object({ date: dateSchema.optional() });
