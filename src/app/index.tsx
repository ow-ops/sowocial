import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/auth/session';

export default function Index() {
  const { session } = useSession();
  // The root anchor already put the tabs under this route. A Redirect would stack a second copy,
  // so back from Home would land on it instead of leaving the app.
  useEffect(() => {
    if (session) router.dismissTo('/home');
  }, [session]);
  return session ? null : <Redirect href="/login" />;
}
