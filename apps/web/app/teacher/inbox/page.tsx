'use client';

import { Inbox } from '@/components/app/inbox';

export default function TeacherInbox() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Notices</h1>
      <Inbox />
    </div>
  );
}
