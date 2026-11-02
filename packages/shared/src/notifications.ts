// Default automations (BRD §12) and message templates. WhatsApp templates must be approved
// by Meta under `whatsappName` with the same positional parameters as `params`.

export const NOTIFICATION_EVENTS = {
  'attendance.absent': { label: 'Student marked absent', template: 'student_absent', defaultTiming: 'immediate' },
  'calendar.published': { label: 'Holiday or event declared', template: 'calendar_event', defaultTiming: 'immediate' },
  'homework.posted': { label: 'Homework posted', template: 'homework_digest', defaultTiming: 'digest' },
  'material.added': { label: 'New learning material', template: 'material_digest', defaultTiming: 'digest' },
  'circular.published': { label: 'Circular or notice published', template: 'circular', defaultTiming: 'immediate' },
} as const satisfies Record<string, { label: string; template: string; defaultTiming: 'immediate' | 'digest' }>;

export type NotificationEventType = keyof typeof NOTIFICATION_EVENTS;
export const NOTIFICATION_EVENT_TYPES = Object.keys(NOTIFICATION_EVENTS) as NotificationEventType[];

export interface MessageTemplate {
  whatsappName: string;
  /** Variable names in WhatsApp parameter order ({{1}}, {{2}}, ...). */
  params: string[];
  /** Body per language; falls back to English. */
  bodies: Record<string, string>;
}

export const MESSAGE_TEMPLATES: Record<string, MessageTemplate> = {
  student_absent: {
    whatsappName: 'student_absent_v1',
    params: ['studentName', 'date', 'instituteName'],
    bodies: {
      en: 'Dear parent, {{studentName}} was marked absent today ({{date}}) at {{instituteName}}. If this is unexpected, please contact the school.',
      hi: 'प्रिय अभिभावक, {{studentName}} को आज ({{date}}) {{instituteName}} में अनुपस्थित दर्ज किया गया है। यदि यह अपेक्षित नहीं है, तो कृपया विद्यालय से संपर्क करें।',
    },
  },
  calendar_event: {
    whatsappName: 'calendar_event_v1',
    params: ['instituteName', 'title', 'dates'],
    bodies: {
      en: '{{instituteName}}: {{title}} on {{dates}}.',
      hi: '{{instituteName}}: {{dates}} को {{title}}।',
    },
  },
  homework_digest: {
    whatsappName: 'homework_digest_v1',
    params: ['studentName', 'items'],
    bodies: {
      en: "Today's homework for {{studentName}}: {{items}}",
      hi: '{{studentName}} का आज का गृहकार्य: {{items}}',
    },
  },
  material_digest: {
    whatsappName: 'material_digest_v1',
    params: ['studentName', 'items'],
    bodies: {
      en: 'New study material for {{studentName}}: {{items}}',
      hi: '{{studentName}} के लिए नई अध्ययन सामग्री: {{items}}',
    },
  },
  circular: {
    whatsappName: 'circular_v1',
    params: ['instituteName', 'title', 'link'],
    bodies: {
      en: '{{instituteName}} circular: {{title}}. Read it here: {{link}}',
      hi: '{{instituteName}} परिपत्र: {{title}}। यहाँ पढ़ें: {{link}}',
    },
  },
};

export function renderTemplate(key: string, language: string, variables: Record<string, string>): string {
  const template = MESSAGE_TEMPLATES[key];
  if (!template) throw new Error(`Unknown message template: ${key}`);
  const body = template.bodies[language] ?? template.bodies[language.split('-')[0]!] ?? template.bodies.en!;
  return body.replace(/\{\{(\w+)\}\}/g, (_, name: string) => variables[name] ?? '');
}
