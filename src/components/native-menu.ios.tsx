import { Button, Divider, Host, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as a11yLabel,
  buttonStyle,
  contentShape,
  controlSize,
  frame,
  labelStyle,
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
        label={label}
        systemImage={icon ? 'ellipsis' : undefined}
        modifiers={
          icon
            ? [
                labelStyle('iconOnly'),
                tint(theme.muted),
                frame({ width: 48, height: 44 }),
                contentShape(shapes.rectangle()),
              ]
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
