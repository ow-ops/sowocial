import { t } from '@/i18n';

type XrpcLike = { error?: string; status?: number; message?: string };

export function chatErrorMessage(error: unknown) {
  const { error: code, status, message } = (error ?? {}) as XrpcLike;
  switch (code) {
    case 'MessagesDisabled':
      return t('chat.errors.disabled');
    case 'NotFollowedBySender':
      return t('chat.errors.notAllowed');
    case 'BlockedActor':
    case 'BlockedSubject':
      return t('chat.errors.blocked');
    case 'ConvoLocked':
      return t('chat.errors.locked');
    case 'RecipientNotFound':
      return t('chat.errors.recipientNotFound');
  }
  if (status === 401 || status === 403 || /scope/i.test(message ?? '')) return t('chat.errors.access');
  return message || t('chat.errors.generic');
}
