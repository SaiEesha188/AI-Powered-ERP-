// Vertical packs (BRD §17): presets applied when an institute is created. They change
// terminology and defaults only; the data model is the same for every vertical.

export const VERTICALS = ['school', 'coaching', 'college', 'skill', 'academy', 'corporate'] as const;
export type Vertical = (typeof VERTICALS)[number];

export interface Terminology {
  class: string;
  section: string;
  homework: string;
  student: string;
  teacher: string;
  exam: string;
}

export interface VerticalPack {
  label: string;
  terminology: Terminology;
  // Channel used for family notifications; corporate teams use chat tools instead of WhatsApp.
  familyChannel: 'whatsapp' | 'none';
  feesEnabled: boolean;
}

export const VERTICAL_PACKS: Record<Vertical, VerticalPack> = {
  school: {
    label: 'K-12 school',
    terminology: { class: 'Class', section: 'Section', homework: 'Homework', student: 'Student', teacher: 'Teacher', exam: 'Exam' },
    familyChannel: 'whatsapp',
    feesEnabled: true,
  },
  coaching: {
    label: 'Coaching centre',
    terminology: { class: 'Course', section: 'Batch', homework: 'Assignment', student: 'Student', teacher: 'Faculty', exam: 'Test' },
    familyChannel: 'whatsapp',
    feesEnabled: true,
  },
  college: {
    label: 'College / institute',
    terminology: { class: 'Course', section: 'Semester', homework: 'Assignment', student: 'Student', teacher: 'Faculty', exam: 'Internal' },
    familyChannel: 'whatsapp',
    feesEnabled: true,
  },
  skill: {
    label: 'Skill / vocational institute',
    terminology: { class: 'Course', section: 'Cohort', homework: 'Practical task', student: 'Learner', teacher: 'Trainer', exam: 'Assessment' },
    familyChannel: 'whatsapp',
    feesEnabled: true,
  },
  academy: {
    label: 'Academy (sports, music, dance)',
    terminology: { class: 'Level', section: 'Group', homework: 'Practice task', student: 'Learner', teacher: 'Coach', exam: 'Assessment' },
    familyChannel: 'whatsapp',
    feesEnabled: true,
  },
  corporate: {
    label: 'Corporate training',
    terminology: { class: 'Programme', section: 'Cohort', homework: 'Learning task', student: 'Learner', teacher: 'Trainer', exam: 'Quiz' },
    familyChannel: 'none',
    feesEnabled: false,
  },
};

export interface Branding {
  logoUrl?: string;
  primaryColor?: string;
  reportCardHeader?: string;
  whatsappSenderName?: string;
}

// Shape of institutes.settings. Institute values override the vertical pack (BRD §17.1).
export interface InstituteSettings {
  terminology: Terminology;
  branding: Branding;
  familyChannel: VerticalPack['familyChannel'];
  feesEnabled: boolean;
  /** ISO weekdays the institute works: 1 = Monday ... 7 = Sunday (CAL-02). */
  workingDays: number[];
  /** CAL-06: holidays declared without calendar.approve wait for the principal. */
  holidayApprovalRequired: boolean;
  /** HW-03: local time ("HH:MM") the daily homework digest goes to families. */
  homeworkDigestTime: string;
  /** ATT-08: attendance taken after this local time ("HH:MM") counts as late on the dashboard. */
  attendanceCutoffTime: string;
  /** Circulars from people without comms.approve wait for the principal. */
  circularApprovalRequired: boolean;
}

const SETTING_DEFAULTS = { holidayApprovalRequired: false, homeworkDigestTime: '16:00', attendanceCutoffTime: '10:00', circularApprovalRequired: false };

/** Settings with defaults filled in, so institutes created before a setting existed still work. */
export function effectiveSettings(stored: Partial<InstituteSettings>, vertical: Vertical): InstituteSettings {
  return { ...defaultSettings(vertical), ...stored };
}

export function defaultSettings(vertical: Vertical): InstituteSettings {
  const pack = VERTICAL_PACKS[vertical];
  return {
    terminology: { ...pack.terminology },
    branding: {},
    familyChannel: pack.familyChannel,
    feesEnabled: pack.feesEnabled,
    workingDays: vertical === 'corporate' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6],
    ...SETTING_DEFAULTS,
  };
}
