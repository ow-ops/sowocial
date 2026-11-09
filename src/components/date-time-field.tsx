import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { Button } from '@/components/button';
import { Pill, Spacing } from '@/constants/theme';
import { intlLocale } from '@/i18n';
import { useScheme, useTheme } from '@/hooks/use-theme';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
};

const MIN_LEAD_MS = 6 * 60 * 1000;

// datetime-local values are local time without a zone, so build them from local parts.
const toInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const format = (date: Date) => date.toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });

// Android only opens its pickers imperatively, one for the date and one for the time.
function openAndroid({ value, onChange }: Props, minimumDate: Date) {
  DateTimePickerAndroid.open({
    value,
    mode: 'date',
    minimumDate,
    onValueChange: (_event, date) =>
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        onValueChange: (_e, picked) => onChange(picked),
      }),
  });
}

export function DateTimeField(props: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useScheme();
  const [minimumDate] = useState(() => new Date(Date.now() + MIN_LEAD_MS));
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        mode="datetime"
        display="compact"
        accentColor={theme.primary}
        themeVariant={scheme}
        value={props.value}
        minimumDate={minimumDate}
        onValueChange={(_event, date) => props.onChange(date)}
      />
    );
  }
  if (Platform.OS === 'android') {
    return <Button label={format(props.value)} variant="outline" size="small" onPress={() => openAndroid(props, minimumDate)} />;
  }
  return createElement('input', {
    type: 'datetime-local',
    value: toInputValue(props.value),
    min: toInputValue(minimumDate),
    'aria-label': t('compose.dateTime.label'),
    onChange: (e: { target: { value: string } }) => {
      const picked = new Date(e.target.value);
      if (!Number.isNaN(picked.getTime())) props.onChange(picked);
    },
    style: {
      minHeight: 36,
      boxSizing: 'border-box',
      padding: `0 ${Spacing.three}px`,
      borderRadius: Pill,
      border: `1px solid ${theme.outline}`,
      background: 'transparent',
      color: theme.heading,
      colorScheme: scheme,
      font: 'inherit',
      fontSize: 14,
    },
  });
}
