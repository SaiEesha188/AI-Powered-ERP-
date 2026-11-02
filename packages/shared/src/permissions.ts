// Platform permission catalogue (BRD §5.1, §17.1 "platform defaults").
// Codes are stable identifiers stored in the database; never rename one, add a new code instead.
// "Own" access for parents and students (O in the BRD matrix) is not a permission at all; see
// SYSTEM_ROLES.parent below.

export const PERMISSIONS = [
  { code: 'institute.settings.view', module: 'setup', description: 'View institute settings' },
  { code: 'institute.settings.manage', module: 'setup', description: 'Edit institute settings, terminology and branding' },
  { code: 'roles.view', module: 'users', description: 'View roles and their permissions' },
  { code: 'roles.manage', module: 'users', description: 'Create custom roles and change role permissions' },
  { code: 'users.view', module: 'users', description: 'View institute users and their roles' },
  { code: 'users.manage', module: 'users', description: 'Add users and assign or remove roles' },
  { code: 'calendar.view', module: 'calendar', description: 'View academic years, terms, holidays and events' },
  { code: 'calendar.manage', module: 'calendar', description: 'Manage academic years, terms, holidays and events' },
  { code: 'calendar.approve', module: 'calendar', description: 'Approve holidays and events before they are announced' },
  { code: 'students.view', module: 'students', description: 'View student records' },
  { code: 'students.manage', module: 'students', description: 'Admit students and edit student records' },
  { code: 'staff.view', module: 'staff', description: 'View staff records' },
  { code: 'staff.manage', module: 'staff', description: 'Edit staff records and assignments' },
  { code: 'academics.view', module: 'academics', description: 'View classes, subjects and timetable' },
  { code: 'academics.manage', module: 'academics', description: 'Manage classes, sections, subjects and timetable' },
  { code: 'academics.approve', module: 'academics', description: 'Approve timetables' },
  { code: 'attendance.view', module: 'attendance', description: 'View student attendance' },
  { code: 'attendance.mark', module: 'attendance', description: 'Mark attendance for assigned sections' },
  { code: 'attendance.edit_any', module: 'attendance', description: 'Correct attendance after the edit window, with a reason' },
  { code: 'staff_attendance.view', module: 'staff_attendance', description: 'View staff attendance and leave' },
  { code: 'staff_attendance.manage', module: 'staff_attendance', description: 'Record staff attendance and apply for leave' },
  { code: 'leave.approve', module: 'staff_attendance', description: 'Approve staff leave and substitutions' },
  { code: 'curriculum.view', module: 'curriculum', description: 'View curriculum and syllabus progress' },
  { code: 'curriculum.manage', module: 'curriculum', description: 'Build curriculum and record topics covered' },
  { code: 'curriculum.approve', module: 'curriculum', description: 'Approve curriculum plans' },
  { code: 'homework.view', module: 'homework', description: 'View homework' },
  { code: 'homework.manage', module: 'homework', description: 'Post and review homework' },
  { code: 'materials.view', module: 'materials', description: 'View learning materials' },
  { code: 'materials.manage', module: 'materials', description: 'Share learning materials' },
  { code: 'exams.view', module: 'exams', description: 'View exams and date sheets' },
  { code: 'exams.manage', module: 'exams', description: 'Set up exams and papers' },
  { code: 'exams.approve', module: 'exams', description: 'Approve exam setup' },
  { code: 'marks.view', module: 'marks', description: 'View marks sheets' },
  { code: 'marks.enter', module: 'marks', description: 'Enter marks for assigned papers' },
  { code: 'marks.moderate', module: 'marks', description: 'Moderate and lock marks for a section' },
  { code: 'report_cards.view', module: 'marks', description: 'View report cards' },
  { code: 'report_cards.manage', module: 'marks', description: 'Generate report cards and edit remarks' },
  { code: 'report_cards.publish', module: 'marks', description: 'Approve and publish report cards' },
  { code: 'comms.view', module: 'comms', description: 'View circulars and messages' },
  { code: 'comms.send', module: 'comms', description: 'Create circulars and message audiences' },
  { code: 'comms.approve', module: 'comms', description: 'Approve circulars before sending' },
  { code: 'fees.view', module: 'fees', description: 'View fees, invoices and payments' },
  { code: 'fees.manage', module: 'fees', description: 'Manage fee structures and invoices' },
  { code: 'fees.collect', module: 'fees', description: 'Record counter payments and issue receipts' },
  { code: 'reports.view', module: 'reports', description: 'View dashboards and standard reports' },
  { code: 'reports.build', module: 'reports', description: 'Build and share custom stats' },
  { code: 'audit.view', module: 'audit', description: 'View the audit log' },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

const ALL_CODES = PERMISSIONS.map((p) => p.code);

const TEACHER: PermissionCode[] = [
  'calendar.view',
  'students.view',
  'staff.view',
  'academics.view',
  'attendance.view',
  'attendance.mark',
  'staff_attendance.manage',
  'curriculum.view',
  'curriculum.manage',
  'homework.view',
  'homework.manage',
  'materials.view',
  'materials.manage',
  'exams.view',
  'exams.manage',
  'marks.view',
  'marks.enter',
  'report_cards.view',
  'comms.view',
  'comms.send',
  'reports.view',
];

export type SystemRoleCode =
  | 'management'
  | 'principal'
  | 'admin'
  | 'accountant'
  | 'teacher'
  | 'class_teacher'
  | 'parent'
  | 'student';

// Default roles copied into every new institute (BRD §5). Institutes rename them through
// vertical-pack terminology and add custom roles; system roles themselves cannot be deleted.
export const SYSTEM_ROLES: Record<SystemRoleCode, { name: string; permissions: PermissionCode[] }> = {
  management: {
    name: 'Management',
    permissions: [
      ...ALL_CODES.filter((c) => c.endsWith('.view')),
      'institute.settings.manage',
      'roles.manage',
      'users.manage',
      'comms.send',
      'comms.approve',
      'reports.build',
    ],
  },
  principal: {
    name: 'Principal',
    permissions: [
      'institute.settings.view',
      'roles.view',
      'users.view',
      'calendar.view',
      'calendar.approve',
      'students.view',
      'staff.view',
      'academics.view',
      'academics.approve',
      'attendance.view',
      'staff_attendance.view',
      'leave.approve',
      'curriculum.view',
      'curriculum.approve',
      'homework.view',
      'materials.view',
      'exams.view',
      'exams.approve',
      'marks.view',
      'report_cards.view',
      'report_cards.publish',
      'comms.view',
      'comms.send',
      'comms.approve',
      'fees.view',
      'reports.view',
      'reports.build',
      'audit.view',
    ],
  },
  admin: {
    name: 'Institute Admin',
    permissions: [
      'institute.settings.view',
      'institute.settings.manage',
      'roles.view',
      'roles.manage',
      'users.view',
      'users.manage',
      'calendar.view',
      'calendar.manage',
      'students.view',
      'students.manage',
      'staff.view',
      'staff.manage',
      'academics.view',
      'academics.manage',
      'attendance.view',
      'attendance.mark',
      'attendance.edit_any',
      'staff_attendance.view',
      'staff_attendance.manage',
      'curriculum.view',
      'homework.view',
      'materials.view',
      'materials.manage',
      'exams.view',
      'exams.manage',
      'marks.view',
      'report_cards.view',
      'report_cards.manage',
      'comms.view',
      'comms.send',
      'fees.view',
      'fees.manage',
      'reports.view',
    ],
  },
  accountant: {
    name: 'Accountant',
    permissions: ['students.view', 'staff.view', 'fees.view', 'fees.manage', 'fees.collect', 'reports.view'],
  },
  teacher: { name: 'Teacher', permissions: TEACHER },
  class_teacher: {
    name: 'Class Teacher',
    permissions: [...TEACHER, 'marks.moderate', 'report_cards.manage'],
  },
  // "Own" access (O in the BRD matrix) is a relationship, not a permission: parents and students
  // use the /family endpoints, which check the guardian link or the student's own record.
  // Any .view permission here would expose the whole institute.
  parent: { name: 'Parent', permissions: [] },
  student: { name: 'Student', permissions: [] },
};
