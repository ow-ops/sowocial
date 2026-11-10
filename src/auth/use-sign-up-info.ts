import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { loadSignUpInfo } from './sign-up';

const DEBOUNCE_MS = 500;

export function useSignUpInfo(input: string) {
  const trimmed = input.trim();
  const [server, setServer] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setServer(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  return useQuery({
    queryKey: ['sign-up-info', server],
    queryFn: () => loadSignUpInfo(server),
    enabled: /\.|^(https?:\/\/)?localhost/i.test(server),
    retry: false,
    staleTime: 5 * 60_000,
  });
}
