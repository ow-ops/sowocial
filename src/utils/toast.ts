import { toast } from 'sonner-native';

import { Spacing } from '@/constants/theme';

// Long enough to reach the action, with the action beside the message rather than under it.
const ACTION_DURATION = 6000;
const actionLayout = {
  textContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  buttons: { marginTop: 0 },
} as const;

export function showToast(message: string, action?: { label: string; onClick: () => void }) {
  toast(message, action && { action, duration: ACTION_DURATION, styles: actionLayout });
}

export function showError(title: string, description?: string) {
  toast.error(title, { description });
}
