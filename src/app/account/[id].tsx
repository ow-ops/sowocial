import { Stack, useLocalSearchParams } from 'expo-router';

import { ActingAccount } from '@/auth/session';
import { AccountProfile } from '@/components/account-profile';

export default function AccountScreen() {
  const { id, account } = useLocalSearchParams<{ id: string; account?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <ActingAccount account={account}>
        <AccountProfile id={id} />
      </ActingAccount>
    </>
  );
}
