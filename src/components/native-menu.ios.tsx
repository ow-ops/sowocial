import { Button, Divider, HStack, Host, Image, Menu, Text } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as a11yLabel,
  aspectRatio,
  buttonStyle,
  contentShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
  resizable,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Fragment } from 'react';
import { useWindowDimensions, View } from 'react-native';

import type { NativeMenuProps } from '@/components/native-menu';
import { scaledFontSize } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shortCount } from '@/utils/text';

export function NativeMenu({ label, accessibilityLabel, groups, trigger, icon: custom }: NativeMenuProps) {
  const theme = useTheme();
  const icon = trigger === 'icon';
  const color = custom?.color ?? theme.muted;
  const count = icon && custom?.count ? custom.count : null;
  const countSize = scaledFontSize('meta', useWindowDimensions().fontScale);
  const menu = (
    <Host
      // matchContents is read only on mount, so a host that gains or loses a count has to remount.
      key={count ? 'count' : 'plain'}
      matchContents={!icon || !!count}
      style={!icon ? undefined : count ? { minWidth: 48, height: 44 } : { width: 48, height: 44 }}
      alignment="center">
      <Menu
        // A Menu is tappable only where its label draws, so the frame goes on the label, not on the Menu.
        label={
          icon ? (
            <HStack
              spacing={Spacing.one}
              modifiers={[
                // Leading padding only, so a count grows to the right of the icon without moving it.
                ...(count ? [padding({ leading: (48 - (custom?.size ?? 22)) / 2 })] : []),
                frame({ minWidth: 48, minHeight: 44, maxHeight: 44 }),
                contentShape(shapes.rectangle()),
                a11yLabel(label),
              ]}>
              <Image
                systemName={(typeof custom?.name === 'object' ? custom.name.ios : custom?.name) ?? 'ellipsis'}
                color={color}
                // Fitted to a square the way SymbolView sizes icons; a font size would draw wide glyphs larger.
                modifiers={
                  custom?.size
                    ? [resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: custom.size, height: custom.size })]
                    : undefined
                }
              />
              {count && <Text modifiers={[font({ size: countSize }), monospacedDigit(), foregroundStyle(color)]}>{shortCount(count)}</Text>}
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
