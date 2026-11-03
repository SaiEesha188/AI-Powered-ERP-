'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullPageSpinner } from '@/components/brand';
import { useSession } from '@/lib/session';

/** Sends people to sign-in, the institute picker, or the app they last used. */
export default function Home() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session === undefined) return;
    if (!session) router.replace('/login');
    else if (session.experience === 'platform') router.replace('/platform');
    else if (session.instituteId && session.experience) router.replace(`/${session.experience}`);
    else router.replace('/select');
  }, [session, router]);
  return <FullPageSpinner />;
}
