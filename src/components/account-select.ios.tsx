import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';

import { accountKey } from '@/auth/session';
import type { AccountSelectProps } from '@/components/account-select';
import { sessionHandle } from '@/components/source-badge';
import { useTheme } from '@/hooks/use-theme';

export function AccountSelect({ label, current, choices, onSelect }: AccountSelectProps) {
  const theme = useTheme();
  const currentKey = accountKey(current);
  return (
    <Host matchContents>
      <Picker
        label={label}
        selection={currentKey}
        onSelectionChange={(key: string) => {
          const target = choices.find((s) => accountKey(s) === key);
          if (target && key !== currentKey) onSelect(target);
        }}
        modifiers={[pickerStyle('menu'), tint(theme.primary)]}>
        {choices.map((s) => (
          <Text key={accountKey(s)} modifiers={[tag(accountKey(s))]}>
            {sessionHandle(s)}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
