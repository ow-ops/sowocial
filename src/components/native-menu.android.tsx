import { DropdownMenu, DropdownMenuItem, Host, HorizontalDivider, RNHostView, Text } from '@expo/ui/jetpack-compose';
import { Fragment, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Button } from '@/components/button';
import type { NativeMenuProps } from '@/components/native-menu';
import { useScheme, useTheme } from '@/hooks/use-theme';

export function NativeMenu({ label, accessibilityLabel, groups, trigger, icon, initiallyOpen = false }: NativeMenuProps) {
  const theme = useTheme();
  const scheme = useScheme();
  const [expanded, setExpanded] = useState(initiallyOpen);
  const open = () => setExpanded(true);

  return (
    <Host matchContents colorScheme={scheme}>
      <DropdownMenu expanded={expanded} onDismissRequest={() => setExpanded(false)} color={theme.surface}>
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            {trigger === 'icon' ? (
              <Pressable
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={{
                  width: 48,
                  height: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <SymbolView
                  name={icon?.name ?? { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
                  size={icon ? 20 : 18}
                  tintColor={icon?.color ?? theme.muted}
                />
              </Pressable>
            ) : (
              <View style={{ minHeight: 48, justifyContent: 'center' }}>
                <Button label={label} accessibilityLabel={accessibilityLabel} variant="outline" size="small" onPress={open} />
              </View>
            )}
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {expanded &&
            groups.map((group, index) => (
              <Fragment key={group.key}>
                {index > 0 && <HorizontalDivider color={theme.outline} />}
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.key}
                    elementColors={item.destructive ? { textColor: theme.danger } : { textColor: theme.heading }}
                    onClick={() => {
                      setExpanded(false);
                      item.onPress();
                    }}>
                    <DropdownMenuItem.Text>
                      <Text>{item.title}</Text>
                    </DropdownMenuItem.Text>
                    {item.icon === 'checkmark' && (
                      <DropdownMenuItem.TrailingIcon>
                        <Text>✓</Text>
                      </DropdownMenuItem.TrailingIcon>
                    )}
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
