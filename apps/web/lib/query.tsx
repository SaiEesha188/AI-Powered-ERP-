'use client';

import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import { useSession } from './session';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** GET with caching. Keys include the institute so switching institutes never shows stale data. */
export function useApi<T>(path: string | null, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  const session = useSession();
  return useQuery({
    queryKey: [path, session?.instituteId],
    queryFn: () => api<T>(path!),
    enabled: Boolean(path) && Boolean(session) && (opts.enabled ?? true),
    refetchInterval: opts.refetchInterval,
  });
}

/**
 * A write. On success, refreshes every query whose path starts with one of `invalidate`
 * and shows `success` as a toast; on failure, shows the API's message.
 */
export function useMutate<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: {
    invalidate?: string[];
    success?: string | ((r: TResult) => string);
    onSuccess?: (r: TResult) => void;
    /** Skip the error toast for network failures the caller handles itself (offline saving). */
    quietNetworkErrors?: boolean;
  } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      if (opts.invalidate?.length) {
        await client.invalidateQueries({ predicate: (q) => opts.invalidate!.some((p) => String(q.queryKey[0] ?? '').startsWith(p)) });
      }
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      opts.onSuccess?.(result);
    },
    onError: (error) => {
      if (opts.quietNetworkErrors && !(error instanceof ApiError)) return;
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    },
  });
}
