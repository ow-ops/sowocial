import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { keys } from '@/api/keys';
import { loadBsky } from '@/auth/bsky-loader';
import { OAuthCallback } from '@/components/oauth-callback';

export default function BlueskyOAuthRoute() {
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return <BlueskyCallback />;
}

function BlueskyCallback() {
  const result = useQuery({
    queryKey: keys.bskyOAuthCallback,
    queryFn: async () => (await loadBsky()).completeOAuthSignIn(),
    retry: false,
    staleTime: Infinity,
  });

  return (
    <OAuthCallback
      data={result.data}
      error={result.isError ? result.error.message : undefined}
      idle={result.data === null}
      signedOutHref="/login"
    />
  );
}
