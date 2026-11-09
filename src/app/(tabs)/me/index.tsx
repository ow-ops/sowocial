import { useAuthedSession } from '@/auth/session';
import { AccountProfile } from '@/components/account-profile';

export default function MyProfile() {
  const { accountId } = useAuthedSession();
  return <AccountProfile id={accountId} underTabs />;
}
