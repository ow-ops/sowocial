import { toast } from 'sonner';

export function showToast(message: string, action?: { label: string; onClick: () => void }) {
  toast(message, action && { action });
}

export function showError(title: string, description?: string) {
  toast.error(title, { description });
}
