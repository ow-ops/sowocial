import { Button, Divider, Host, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as a11yLabel,
  buttonStyle,
  contentShape,
  controlSize,
  frame,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Fragment } from 'react';

import type { NativeMenuProps } from '@/components/native-menu';
import { useTheme } from '@/hooks/use-theme';

export function NativeMenu({ label, accessibilityLabel, groups, trigger }: NativeMenuProps) {
  const theme = useTheme();
  const icon = trigger === 'icon';
  return (
    <Host matchContents={!icon} style={icon ? { width: 48, height: 44 } : undefined} alignment="center">
      <Menu
        // A Menu is tappable only where its label draws, so the frame goes on the label, not on the Menu.
        label={
          icon ? (
            <Image
              systemName="ellipsis"
              color={theme.muted}
              modifiers={[frame({ width: 48, height: 44 }), contentShape(shapes.rectangle()), a11yLabel(label)]}
            />
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
}
