import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { DateTimeField, openAndroidDatePicker } from '@/components/date-time-field';
import { Spacing } from '@/constants/theme';
import { parseDateInput } from '@/utils/date-input';
import { initialDate, toDateString } from '@/utils/search-filters';

type Props = {
  label: string;
  // YYYY-MM-DD, or undefined for no date.
  value?: string;
  onChange: (value?: string) => void;
  min?: string;
  max?: string;
};

// The picker mounts only once a date is chosen, because DateTimeField always holds a real date.
export function OptionalDateField({ label, value, onChange, min, max }: Props) {
  const { t } = useTranslation();
  if (!value) {
    return (
      <View style={styles.row}>
        <Button
          label={t('timeline.search.anyDate')}
          accessibilityLabel={t('timeline.search.chooseDate', { label })}
          variant="outline"
          size="small"
          onPress={() => {
            const start = initialDate(min, max);
            if (Platform.OS !== 'android') return onChange(toDateString(start));
            openAndroidDatePicker({
              value: start,
              minimumDate: min ? parseDateInput(min) : undefined,
              maximumDate: max ? parseDateInput(max) : undefined,
              onChange: (date) => onChange(toDateString(date)),
            });
          }}
        />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <DateTimeField
        mode="date"
        label={label}
        value={parseDateInput(value)}
        minimumDate={min ? parseDateInput(min) : undefined}
        maximumDate={max ? parseDateInput(max) : undefined}
        onChange={(date) => onChange(toDateString(date))}
      />
      <Button
        label={t('timeline.search.clearDate')}
        accessibilityLabel={t('timeline.search.clearDateNamed', { label })}
        variant="outline"
        size="small"
        onPress={() => onChange(undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
