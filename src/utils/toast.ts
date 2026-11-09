import { toast } from 'sonner-native';

export function showToast(message: string) {
  toast(message);
}

export function showError(title: string, description?: string) {
  toast.error(title, { description });
}
