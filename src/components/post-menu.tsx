import { useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ActingAccount } from '@/auth/session';
import { useAccountActions, useStatusActions } from '@/components/menu-actions';
import { NativeMenu, type NativeMenuProps } from '@/components/native-menu';
import type { Author, Post } from '@/model/post';

// SwiftUI menus can't be opened from code, so iOS mounts the native menu up front.
export function PostMenu({
  status,
  icon,
  trigger,
}: {
  status: Post;
  icon?: NativeMenuProps['icon'];
  trigger: (onPress: () => void) => ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  if (Platform.OS !== 'ios' && !armed) return trigger(() => setArmed(true));
  return (
    <ActingAccount account={status.accountKey}>
      <StatusNativeMenu status={status} icon={icon} trigger={trigger} initiallyOpen={armed} />
    </ActingAccount>
  );
}

function StatusNativeMenu({
  status,
  icon,
  trigger,
  initiallyOpen,
}: {
  status: Post;
  icon?: NativeMenuProps['icon'];
  trigger: (onPress: () => void) => ReactNode;
  initiallyOpen: boolean;
}) {
  const { t } = useTranslation();
  return (
    <NativeMenu
      label={t('status.actions.more')}
      trigger="icon"
      icon={icon}
      groups={useStatusActions(status)}
      renderTrigger={trigger}
      initiallyOpen={initiallyOpen}
    />
  );
}

export function AccountMenuButton({
  account,
  renderTrigger,
  own,
}: {
  account: Author;
  renderTrigger: (onPress: () => void) => ReactNode;
  own?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <NativeMenu
      label={t('status.actions.more')}
      trigger="icon"
      groups={useAccountActions(account, { own })}
      renderTrigger={renderTrigger}
    />
  );
}
