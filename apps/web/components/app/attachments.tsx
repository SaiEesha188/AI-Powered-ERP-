'use client';

import { Camera, FileText, Loader2, Mic, Paperclip, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiRaw, fileUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { FileLink } from '@/lib/types';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.mp3,.m4a,.ogg,.opus,.webm,.mp4';

function iconFor(mime: string) {
  if (mime.startsWith('audio/')) return Mic;
  if (mime.startsWith('image/')) return Camera;
  return FileText;
}

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Uploads photos, PDFs and voice notes (HW-02) and returns their ids. */
export function AttachmentPicker({ value, onChange, camera }: { value: FileLink[]; onChange: (files: FileLink[]) => void; camera?: boolean }) {
  const [busy, setBusy] = useState(0);

  async function upload(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      setBusy((n) => n + 1);
      const form = new FormData();
      form.append('file', file);
      const res = await apiRaw('/files', { method: 'POST', form });
      const body = await res.json().catch(() => ({}));
      setBusy((n) => n - 1);
      if (!res.ok) toast.error(`${file.name}: ${body.message ?? 'upload failed'}`);
      else onChange([...value, body as FileLink]);
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((f) => {
            const Icon = iconFor(f.mime);
            return (
              <li key={f.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 py-1.5 pl-2.5 pr-1.5 text-[13px]">
                <Icon className="size-4 text-brand" />
                <span className="max-w-40 truncate">{f.name}</span>
                <span className="text-text-3">{formatSize(f.sizeBytes)}</span>
                <button type="button" className="rounded-md p-0.5 text-text-3 hover:bg-border hover:text-text" onClick={() => onChange(value.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`}>
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {camera && (
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-sm font-medium shadow-soft hover:bg-surface-2">
            <Camera className="size-4" /> Photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => upload(e.target.files)} />
          </label>
        )}
        <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-3 text-sm font-medium shadow-soft hover:bg-surface-2', busy && 'opacity-70')}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          {busy ? 'Uploading…' : 'Attach file'}
          <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
    </div>
  );
}

export function AttachmentList({ files }: { files: FileLink[] }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => {
        const Icon = iconFor(f.mime);
        return (
          <li key={f.id}>
            <a href={fileUrl(f.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-[13px] font-medium shadow-soft hover:border-brand hover:text-brand">
              <Icon className="size-4" />
              <span className="max-w-48 truncate">{f.name}</span>
              <span className="font-normal text-text-3">{formatSize(f.sizeBytes)}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
