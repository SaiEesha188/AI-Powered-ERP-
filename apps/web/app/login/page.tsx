'use client';

import { phoneSchema } from '@erp/shared';
import { ArrowLeft, Bell, CalendarCheck2, MessageCircle, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { api, ApiError } from '@/lib/api';
import { setSession, useSession } from '@/lib/session';

const RESEND_AFTER = 30;

/** Accepts 98765 43210, 09876543210 or +91 98765 43210. */
function toE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return digits;
}

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [devCode, setDevCode] = useState<string>();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session) router.replace('/');
  }, [session, router]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    const e164 = toE164(phone);
    if (!phoneSchema.safeParse(e164).success) return setError('Enter a valid mobile number');
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<{ devCode?: string | null }>('/auth/otp/request', { method: 'POST', body: { phone: e164 }, noInstitute: true });
      if (res.devCode === null) {
        // Development servers say when a number is unknown; production never does.
        setError('No school has added this number. Demo numbers: 90000 00002 (office), 90000 00003 (principal), 90000 00004 (teacher), 90000 00005 (parent).');
        return;
      }
      setPhone(e164);
      setDevCode(res.devCode ?? undefined);
      if (res.devCode) setCode(res.devCode);
      setStep('code');
      setWait(RESEND_AFTER);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code');
    setBusy(true);
    setError(undefined);
    try {
      const tokens = await api<{ accessToken: string; refreshToken: string }>('/auth/otp/verify', { method: 'POST', body: { phone, code }, noInstitute: true });
      setSession(tokens);
      router.replace('/select');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That code is wrong or has expired' : 'Could not sign in. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#13284a] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-[#1f4b7a] opacity-60 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -left-24 size-[30rem] rounded-full bg-[#0f8b80] opacity-30 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/20">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6.5C5.5 5 8.5 5 12 7c3.5-2 6.5-2 9-.5V18c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z" />
              <path d="m8.5 12.5 2.5 2.5 4.5-5" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Vidya ERP</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight">Your whole school day, in one place.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Attendance in a tap, homework that reaches every parent, and circulars people actually read.
          </p>
          <ul className="mt-10 grid gap-4 text-[14px] text-white/85">
            {[
              { icon: CalendarCheck2, text: 'Attendance in under two minutes, even offline' },
              { icon: MessageCircle, text: 'Parents updated on WhatsApp automatically' },
              { icon: Bell, text: 'One daily homework digest per child' },
              { icon: ShieldCheck, text: 'Each school’s data kept strictly separate' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-[12px] text-white/45">For schools, coaching centres and colleges.</p>
      </section>

      <section className="flex flex-col px-6 py-10 sm:px-12">
        <Logo className="lg:hidden" />
        <div className="mx-auto my-auto w-full max-w-sm py-10 animate-in">
          {step === 'phone' ? (
            <form onSubmit={requestCode} noValidate>
              <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              <p className="mt-1.5 text-sm text-text-3">We’ll send a one-time code to your mobile.</p>
              <Field label="Mobile number" error={error} className="mt-8">
                {(id) => (
                  <div className="flex">
                    <span className="inline-flex h-12 items-center rounded-l-[10px] border border-r-0 border-border bg-surface-2 px-3 text-sm text-text-2">+91</span>
                    <Input
                      id={id}
                      value={phone.replace(/^\+91/, '')}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="98765 43210"
                      className="h-12 rounded-l-none text-base"
                      aria-invalid={Boolean(error)}
                      autoFocus
                    />
                  </div>
                )}
              </Field>
              <Button type="submit" size="lg" className="mt-6 w-full" loading={busy}>
                Send code
              </Button>
              <p className="mt-6 text-center text-[12px] leading-relaxed text-text-3">
                Your school adds you using this number. If you can’t sign in, ask the school office.
              </p>
            </form>
          ) : (
            <form onSubmit={verify} noValidate>
              <button type="button" onClick={() => (setStep('phone'), setCode(''), setError(undefined))} className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-3 hover:text-text">
                <ArrowLeft className="size-4" /> Change number
              </button>
              <h2 className="text-2xl font-semibold tracking-tight">Enter the code</h2>
              <p className="mt-1.5 text-sm text-text-3">
                Sent to <span className="font-medium text-text">{phone}</span>
              </p>
              <Field label="6-digit code" error={error} className="mt-8">
                {(id) => (
                  <Input
                    id={id}
                    ref={codeRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    className="h-14 text-center text-2xl font-semibold tracking-[0.6em] tabular-nums"
                    aria-invalid={Boolean(error)}
                  />
                )}
              </Field>
              <Button type="submit" size="lg" className="mt-6 w-full" loading={busy} disabled={code.length !== 6}>
                Verify and continue
              </Button>
              <div className="mt-5 text-center text-[13px] text-text-3">
                {wait > 0 ? (
                  <span>Resend code in {wait}s</span>
                ) : (
                  <button type="button" className="font-medium text-brand hover:underline" onClick={() => requestCode()}>
                    Resend code
                  </button>
                )}
              </div>
              {devCode && (
                <p className="mt-8 rounded-lg bg-info-soft px-3 py-2 text-center text-[12px] text-info">
                  Development mode: no SMS is sent, so the code <span className="font-semibold">{devCode}</span> was filled in for you.
                </p>
              )}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
