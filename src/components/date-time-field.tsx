import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { Button } from '@/components/button';
import { Pill, Spacing } from '@/constants/theme';
import { intlLocale } from '@/i18n';
import { useScheme, useTheme } from '@/hooks/use-theme';
import { parseDateInput } from '@/utils/date-input';

type Props = {
  value: Date;
  onChange: (date: Date) => void;
  mode?: 'date' | 'datetime';
  minimumDate?: Date;
  maximumDate?: Date;
  label?: string;
};

const MIN_LEAD_MS = 6 * 60 * 1000;

// datetime-local values are local time without a zone, so build them from local parts.
const toInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const toDateValue = (date: Date) => toInputValue(date).slice(0, 10);

const format = (date: Date, mode: Props['mode']) =>
  date.toLocaleString(intlLocale(), mode === 'date' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' });

// Android only opens its pickers imperatively, one for the date and one for the time.
function openAndroid({ value, onChange, mode, maximumDate }: Props, minimumDate: Date | undefined) {
  DateTimePickerAndroid.open({
    value,
    mode: 'date',
    minimumDate,
    maximumDate,
    onValueChange: (_event, date) =>
      mode === 'date'
        ? onChange(date)
        : DateTimePickerAndroid.open({
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
  const [leadDate] = useState(() => new Date(Date.now() + MIN_LEAD_MS));
  const dateOnly = props.mode === 'date';
  const minimumDate = props.minimumDate ?? (dateOnly ? undefined : leadDate);
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        mode={props.mode ?? 'datetime'}
        display="compact"
        accentColor={theme.primary}
        themeVariant={scheme}
        value={props.value}
        minimumDate={minimumDate}
        maximumDate={props.maximumDate}
        onValueChange={(_event, date) => props.onChange(date)}
      />
    );
  }
  if (Platform.OS === 'android') {
    return <Button label={format(props.value, props.mode)} variant="outline" size="small" onPress={() => openAndroid(props, minimumDate)} />;
  }
  return createElement('input', {
    type: dateOnly ? 'date' : 'datetime-local',
    value: dateOnly ? toDateValue(props.value) : toInputValue(props.value),
    min: minimumDate && (dateOnly ? toDateValue(minimumDate) : toInputValue(minimumDate)),
    max: props.maximumDate && toDateValue(props.maximumDate),
    'aria-label': props.label ?? t('compose.dateTime.label'),
    onChange: (e: { target: { value: string } }) => {
      const picked = parseDateInput(e.target.value);
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
