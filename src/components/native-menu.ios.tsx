import { Button, Divider, HStack, Host, Image, Menu, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as a11yLabel,
  buttonStyle,
  contentShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Fragment } from 'react';
import { View } from 'react-native';

import type { NativeMenuProps } from '@/components/native-menu';
import { textStyles } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function NativeMenu({ label, accessibilityLabel, groups, trigger, icon: custom }: NativeMenuProps) {
  const theme = useTheme();
  const icon = trigger === 'icon';
  const color = custom?.color ?? theme.muted;
  const count = icon && custom?.count ? custom.count : null;
  const menu = (
    <Host matchContents={!icon || !!count} style={icon && !count ? { width: 48, height: 44 } : undefined} alignment="center">
      <Menu
        // A Menu is tappable only where its label draws, so the frame goes on the label, not on the Menu.
        label={
          icon ? (
            <HStack
              spacing={Spacing.one}
              modifiers={[frame({ minWidth: 48, minHeight: 44, maxHeight: 44 }), contentShape(shapes.rectangle()), a11yLabel(label)]}>
              <Image
                systemName={(typeof custom?.name === 'object' ? custom.name.ios : custom?.name) ?? 'ellipsis'}
                color={color}
                size={custom?.size}
              />
              {count && <Text modifiers={[font({ size: textStyles.meta.fontSize }), foregroundStyle(color)]}>{String(count)}</Text>}
            </HStack>
          ) : (
            label
          )
        }
        modifiers={
          icon
            ? []
            : [
                buttonStyle('bordered'),
                controlSize('small'),
                tint(theme.primary),
                ...(accessibilityLabel ? [a11yLabel(accessibilityLabel)] : []),
              ]
        }>
        {groups.map((group, index) => (
          <Fragment key={group.key}>
            {index > 0 && <Divider />}
            {group.items.map((item) => (
              <Button
                key={item.key}
                label={item.title}
                systemImage={item.icon as never}
                role={item.destructive ? 'destructive' : undefined}
                onPress={item.onPress}
              />
            ))}
          </Fragment>
        ))}
      </Menu>
    </Host>
  );
  // SwiftUI takes the tap without claiming it from React Native, so a pressable row behind the icon would fire too.
  return icon ? <View onStartShouldSetResponder={() => true}>{menu}</View> : menu;
}
