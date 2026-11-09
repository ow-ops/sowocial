import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Row } from '@/components/settings';
import { Spacing } from '@/constants/theme';
import { showError } from '@/utils/toast';

type ActionProps = {
  label: string;
  accessibilityLabel: string;
  failedTitle: string;
  run: (options: { onError: (error: Error) => void }) => void;
};

export function ActionButton({ label, accessibilityLabel, failedTitle, run }: ActionProps) {
  return (
    <Button
      label={label}
      accessibilityLabel={accessibilityLabel}
      variant="outline"
      size="small"
      onPress={() => run({ onError: (e) => showError(failedTitle, e.message) })}
    />
  );
}

type RowProps = ActionProps & { title: string; chevron?: boolean; onPress?: () => void };

export function ActionRow({ title, chevron, onPress, ...action }: RowProps) {
  return (
    <View style={styles.item}>
      <Row title={title} chevron={chevron} onPress={onPress} trailing={<ActionButton {...action} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
