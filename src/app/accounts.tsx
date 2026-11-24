import { AccountSwitcher } from '@/components/account-switcher';
import { SettingsScreen } from '@/components/settings';

export default function AccountsSheet() {
  return (
    <SettingsScreen>
      <AccountSwitcher />
    </SettingsScreen>
  );
}
