import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';

import { keys } from '@/api/keys';
import { completeRedirectSignIn } from '@/auth/oauth';
import { OAuthCallback } from '@/components/oauth-callback';

export default function OAuthRoute() {
  // Native sign-in already got the code from the auth session; Android also delivers
  // the redirect as a deep link, which lands here.
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return <FediverseCallback />;
}

function FediverseCallback() {
  const { code = '', state = '', error } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
  }>();

  // useQuery dedupes, so the single-use code is exchanged once even under StrictMode.
  const result = useQuery({
    queryKey: keys.oauthCallback(code, state),
    queryFn: () => completeRedirectSignIn(code, state),
    enabled: !!code,
    retry: false,
    staleTime: Infinity,
  });

  return (
    <OAuthCallback
      data={result.data}
      error={error ?? (result.isError ? result.error.message : undefined)}
      idle={!code && !error}
    />
  );
}
