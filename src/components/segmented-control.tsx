import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SegmentedControlProps<T extends string> = {
  label: string;
  options: { value: T; label: string; alert?: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => (
        <View key={option.value}>
          <Button
            label={option.label}
            accessibilityLabel={option.alert}
            size="small"
            role="radio"
            variant="outline"
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
          {option.alert ? (
            <View
              pointerEvents="none"
              style={[styles.dot, { backgroundColor: theme.danger, borderColor: theme.page }]}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  choices: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
