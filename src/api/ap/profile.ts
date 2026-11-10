import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import type { ApSession } from '@/auth/types';
import { t } from '@/i18n';

import type { ProfileEdit } from '../backend/types';

// masto's multipart serializer can't send React Native files; expo/fetch with a File can.
export async function updateApProfile({ instance, token }: ApSession, edit: ProfileEdit) {
  const form = new FormData();
  form.append('display_name', edit.displayName);
  form.append('note', edit.note);
  form.append('locked', String(edit.locked));
  form.append('bot', String(edit.bot));
  edit.fields.forEach((field, i) => {
    form.append(`fields_attributes[${i}][name]`, field.name);
    form.append(`fields_attributes[${i}][value]`, field.value);
  });
  if (edit.avatarUri) form.append('avatar', new File(edit.avatarUri));
  if (edit.headerUri) form.append('header', new File(edit.headerUri));

  const res = await fetch(`${instance}/api/v1/accounts/update_credentials`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await profileErrorMessage(res));
}

async function profileErrorMessage(res: { status: number; json(): Promise<unknown> }) {
  const body = await res.json().catch(() => null);
  const reason = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : '';
  return reason || t('profile.errors.saveProfile', { status: res.status });
}
