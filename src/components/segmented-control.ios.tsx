import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';

import type { SegmentedControlProps } from '@/components/segmented-control';
import { useTheme } from '@/hooks/use-theme';
import { selectionHaptic } from '@/utils/haptics';

export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <Host matchContents={{ vertical: true }}>
      <Picker
        label={label}
        selection={value}
        onSelectionChange={(next: T) => {
          selectionHaptic();
          onChange(next);
        }}
        modifiers={[pickerStyle('segmented'), tint(theme.primary)]}>
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
