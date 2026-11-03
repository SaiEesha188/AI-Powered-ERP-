// Response shapes of the API endpoints the web app uses.

export interface Membership {
  instituteId: string;
  name: string;
  subdomain: string;
  vertical: string;
  roles: { code: string; name: string }[];
}

export interface Me {
  user: { id: string; name: string; phone: string | null; email: string | null; isPlatformAdmin: boolean };
  memberships: Membership[];
  permissions?: string[];
}

export interface Terminology {
  class: string;
  section: string;
  homework: string;
  student: string;
  teacher: string;
  exam: string;
}

export interface Institute {
  id: string;
  name: string;
  vertical: string;
  board: string | null;
  subdomain: string;
  timezone: string;
  settings: {
    terminology: Terminology;
    branding: { logoUrl?: string; primaryColor?: string; reportCardHeader?: string; whatsappSenderName?: string };
    familyChannel: 'whatsapp' | 'none';
    workingDays: number[];
    holidayApprovalRequired: boolean;
    homeworkDigestTime: string;
    attendanceCutoffTime: string;
    circularApprovalRequired: boolean;
  };
}

export interface ClassRow {
  id: string;
  name: string;
  level: number;
  subjects: { id: string; name: string; code: string; type: string; periodsPerWeek: number | null }[];
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  type: 'scholastic' | 'co_scholastic' | 'elective';
}

export interface SectionRow {
  id: string;
  name: string;
  classId: string;
  className: string;
  classLevel: number;
  academicYearId: string;
  classTeacherId: string | null;
  classTeacher: { id: string; name: string } | null;
  assignments: { id: string; staffId: string; staffName: string; subjectId: string; subjectName: string }[];
}

export interface StaffRow {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  employeeCode: string | null;
  designation: string;
  joiningDate: string | null;
  status: 'active' | 'left';
  roles: string[];
}

export interface StudentRow {
  id: string;
  admissionNo: string;
  name: string;
  gender: string | null;
  status: string;
  sectionId: string | null;
  sectionName: string | null;
  classId: string | null;
  className: string | null;
  rollNo: number | null;
}

export interface StudentDetail {
  id: string;
  admissionNo: string;
  name: string;
  dob: string | null;
  gender: string | null;
  admissionDate: string | null;
  status: string;
  medicalNotes: string | null;
  guardians: { guardianId: string; userId: string; name: string; phone: string | null; relation: string; isPrimary: boolean; whatsappOptIn: boolean; language: string }[];
  enrollments: { academicYear: string; isCurrentYear: boolean; sectionId: string; sectionName: string; className: string; rollNo: number | null; status: string }[];
  siblings: { id: string; name: string; admissionNo: string }[];
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'leave';

export interface Roster {
  sectionId: string;
  date: string;
  day: { working: boolean; reason?: string; halfDay: boolean };
  marked: boolean;
  markedAt: string | null;
  canEdit: boolean;
  students: { studentId: string; name: string; admissionNo: string; rollNo: number | null; status: AttendanceStatus; remark: string | null }[];
}

export interface DailySummary {
  date: string;
  cutoffTime: string;
  totals: { sections: number; sectionsMarked: number; sectionsMarkedOnTime: number; present: number; absent: number; late: number; halfDay: number; leave: number; attendancePercent: number | null };
  sections: {
    sectionId: string;
    sectionName: string;
    classId: string;
    className: string;
    enrolled: number;
    closed: string | null;
    marked: boolean;
    markedAt: string | null;
    markedOnTime: boolean;
    counts: { present: number; absent: number; late: number; halfDay: number; leave: number } | null;
  }[];
  notMarked: { sectionId: string; className: string; sectionName: string }[];
}

export interface CalendarEvent {
  id: string;
  type: 'holiday' | 'half_day' | 'event' | 'exam' | 'ptm';
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  scope: 'all' | 'classes' | 'staff';
  status: 'pending' | 'approved' | 'rejected';
  classes: { classId: string; className: string }[];
}

export interface FileLink {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  url: string;
}

export interface Homework {
  id: string;
  sectionId: string;
  sectionName: string;
  className: string;
  subjectId: string;
  subjectName: string;
  staffId: string;
  teacherName: string;
  title: string;
  instructions: string | null;
  dueDate: string;
  links: { url: string; label?: string }[];
  isUrgent: boolean;
  status: 'published' | 'cancelled';
  createdAt: string;
  attachments: FileLink[];
  completion?: { done: number; late: number; pending: number } | 'done' | 'late' | 'pending' | null;
  feedback?: string | null;
}

export interface Circular {
  id: string;
  type: 'circular' | 'notice';
  title: string;
  body: string;
  requiresAck: boolean;
  status: 'draft' | 'pending_approval' | 'published';
  createdBy: string;
  publishedAt: string | null;
  createdAt: string;
  recipients?: number;
  read?: number;
  acknowledged?: number;
  readAt?: string | null;
  acknowledgedAt?: string | null;
  attachments?: FileLink[];
}

export interface Child {
  id: string;
  name: string;
  admissionNo: string;
  relation: string;
  sectionId: string | null;
  sectionName: string | null;
  className: string | null;
  classId: string | null;
  rollNo: number | null;
}

export interface Material {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  chapter: string | null;
  title: string;
  description: string | null;
  type: 'link' | 'file';
  url: string | null;
  audience: 'staff' | 'students' | 'everyone';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  file: FileLink | null;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  at: string;
}

export interface PermissionDef {
  code: string;
  module: string;
  description: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export interface UserRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  roles: { code: string; name: string }[];
}

export interface Tenant {
  instituteId: string;
  name: string;
  subdomain: string;
  vertical: string;
  status: string;
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  plan: string | null;
  seats: number | null;
  renewalDate: string | null;
}

export interface OrgUsage {
  id: string;
  name: string;
  plan: string | null;
  quota: number | null;
  used: number;
  percent: number | null;
  alert: 'warning' | 'exceeded' | null;
}

export interface TrendPoint {
  date: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  percent: number | null;
}

export interface AssessmentType {
  id: string;
  name: string;
  weightage: number;
  seq: number;
}

export interface GradeScale {
  id: string;
  name: string;
  isDefault: boolean;
  bands: { id?: string; minPct: number; maxPct: number; grade: string; points: number | null; description: string | null }[];
}

export type ExamStatus = 'draft' | 'scheduled' | 'locked' | 'published';

export interface ExamRow {
  id: string;
  name: string;
  assessmentTypeId: string;
  assessmentType: string;
  startDate: string;
  endDate: string;
  status: ExamStatus;
  gradeScaleId: string | null;
  publishedAt: string | null;
  papers: number;
  classes: { id: string; name: string }[];
}

export interface ExamPaper {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  date: string | null;
  maxMarks: number;
  passMarks: number;
  syllabusScope: string | null;
}

export interface ExamSection {
  id: string;
  name: string;
  classId: string;
  className: string;
  classTeacherId: string | null;
  students: number;
  papers: number;
  expected: number;
  entered: number;
  locked: boolean;
  lockedAt: string | null;
}

export interface ExamDetail extends Omit<ExamRow, 'papers' | 'classes'> {
  papers: ExamPaper[];
  sections: ExamSection[];
  reportCards: { total: number; published: number };
}

export interface MarksGridData {
  paper: { id: string; examId: string; examName: string; subjectName: string; maxMarks: number; passMarks: number; status: ExamStatus };
  locked: boolean;
  canEdit: boolean;
  students: { studentId: string; name: string; rollNo: number | null; admissionNo: string; marks: number | null; absent: boolean }[];
}

export interface MarksTask {
  examId: string;
  examName: string;
  status: ExamStatus;
  paperId: string;
  subjectName: string;
  date: string | null;
  maxMarks: number;
  sectionId: string;
  sectionName: string;
  className: string;
  students: number;
  entered: number;
  locked: boolean;
  isClassTeacher: boolean;
}

export interface ReportCardSubject {
  subjectId: string;
  subject: string;
  maxMarks: number;
  marks: number | null;
  absent: boolean;
  percent: number | null;
  grade: string | null;
  points: number | null;
  passed: boolean | null;
  classAverage: number | null;
}

export interface ReportCardData {
  subjects: ReportCardSubject[];
  totalMarks: number;
  totalMax: number;
  percent: number | null;
  grade: string | null;
  points: number | null;
  passed: boolean;
  rank: number | null;
  sectionSize: number;
  attendancePercent: number | null;
  sectionName: string;
  className: string;
  rollNo: number | null;
}

export interface ReportCardRow {
  id: string;
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  sectionName: string;
  rollNo: number | null;
  percent: number | null;
  grade: string | null;
  rank: number | null;
  passed: boolean;
  hasRemarks: boolean;
  status: 'draft' | 'published';
}

export interface ReportCardDetail {
  id: string;
  examId: string;
  examName: string;
  startDate: string;
  endDate: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  data: ReportCardData;
  remarks: string | null;
  status: 'draft' | 'published';
  publishedAt: string | null;
}

export interface ChildExam {
  examId: string;
  examName: string;
  status: ExamStatus;
  startDate: string;
  endDate: string;
  papers: { subject: string; date: string | null; maxMarks: number; syllabusScope: string | null }[];
}

export interface ChildResult {
  id: string;
  examId: string;
  examName: string;
  assessmentType: string;
  startDate: string;
  endDate: string;
  publishedAt: string | null;
  percent: number | null;
  grade: string | null;
  passed: boolean;
}
