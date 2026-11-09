import * as Menu from '@radix-ui/react-menu';
import { SymbolView } from 'expo-symbols';
import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import type { MenuGroup } from '@/components/menu-actions';
import { BorderWidth, Fonts, Radius, Shadow, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type NativeMenuProps = {
  label: string;
  accessibilityLabel?: string;
  groups: MenuGroup[];
  trigger: 'icon' | 'text';
  renderTrigger: (open: () => void) => ReactNode;
  initiallyOpen?: boolean;
};

const css = `
  [data-sowocial-menu-item][data-highlighted] { background: var(--menu-highlight); }
  [data-sowocial-menu-item][data-highlighted]:focus-visible { outline: 2px solid var(--menu-ring); outline-offset: -2px; }
  [data-sowocial-menu-item][data-disabled] { opacity: 0.4; }
`;

export function NativeMenu({ label, groups, renderTrigger, initiallyOpen = false }: NativeMenuProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const anchor = useRef<HTMLDivElement>(null);

  const content: CSSProperties & Record<`--${string}`, string> = {
    '--menu-highlight': theme.border,
    '--menu-ring': theme.primary,
    minWidth: 220,
    maxWidth: 'min(360px, calc(100vw - 16px))',
    padding: Spacing.one,
    borderRadius: Radius.md,
    border: `${BorderWidth.input}px solid ${theme.border}`,
    background: theme.surface,
    boxShadow: Shadow.overlay,
    zIndex: 1000,
  };

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Anchor ref={anchor} style={{ display: 'inline-flex' }}>
        {renderTrigger(() => setOpen(true))}
      </Menu.Anchor>
      <Menu.Portal>
        <Menu.Content
          aria-label={label}
          align="end"
          sideOffset={Spacing.one}
          collisionPadding={Spacing.two}
          style={content}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            anchor.current?.querySelector<HTMLElement>('[tabindex="0"], button')?.focus();
          }}>
          <style href="sowocial-menu" precedence="default">
            {css}
          </style>
          {groups.map((group, index) => (
            <Fragment key={group.key}>
              {index > 0 && (
                <Menu.Separator
                  style={{ height: 1, margin: `${Spacing.one}px ${Spacing.two}px`, background: theme.border }}
                />
              )}
              {group.items.map((item) => (
                <Menu.Item
                  key={item.key}
                  data-sowocial-menu-item=""
                  onSelect={item.onPress}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: Spacing.three,
                    minHeight: TouchTarget - Spacing.one,
                    padding: `0 ${Spacing.three}px`,
                    borderRadius: Radius.sm,
                    cursor: 'pointer',
                    outline: 'none',
                    userSelect: 'none',
                    fontFamily: Fonts.heading,
                    fontSize: 16,
                    color: item.destructive ? theme.danger : theme.heading,
                  }}>
                  {item.title}
                  {item.icon === 'checkmark' && (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                      size={16}
                      tintColor={theme.primary}
                    />
                  )}
                </Menu.Item>
              ))}
            </Fragment>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
