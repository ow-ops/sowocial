import { toast } from 'sonner';

export function showToast(message: string) {
  toast(message);
}

export function showError(title: string, description?: string) {
  toast.error(title, { description });
}
