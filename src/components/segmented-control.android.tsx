import { Host, SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';

import type { SegmentedControlProps } from '@/components/segmented-control';
import { useScheme, useTheme } from '@/hooks/use-theme';
import { selectionHaptic } from '@/utils/haptics';

export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const theme = useTheme();
  const scheme = useScheme();
  return (
    <Host matchContents={{ vertical: true }} colorScheme={scheme}>
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth(), semantics({ contentDescription: label })]}>
        {options.map((option) => (
          <SegmentedButton
            key={option.value}
            selected={value === option.value}
            colors={{
              activeContainerColor: theme.primary,
              activeContentColor: theme.onPrimary,
              activeBorderColor: theme.primary,
              inactiveContainerColor: theme.page,
              inactiveContentColor: theme.heading,
              inactiveBorderColor: theme.outline,
            }}
            onClick={() => {
              selectionHaptic();
              onChange(option.value);
            }}>
            <SegmentedButton.Label>
              <Text>{option.label}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}
