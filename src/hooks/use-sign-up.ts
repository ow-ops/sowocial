import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MastoHttpError } from 'masto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { handlesError } from '@/api/mutation-meta';
import { useSession } from '@/auth/session';
import { activate, createAccount, resendConfirmation, type PendingAccount, type SignUpParams } from '@/auth/sign-up';
import { fieldErrors, needsWebSignUp, type FieldErrors } from '@/auth/sign-up-plan';
import type { ApSession } from '@/auth/types';
import { showError, showToast } from '@/utils/toast';

export function useSignUp() {
  const { t } = useTranslation();
  const { setSession } = useSession();
  const [pending, setPending] = useState<PendingAccount | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [needsWeb, setNeedsWeb] = useState(false);

  const finish = async (session: ApSession) => {
    await setSession(session);
    router.dismissTo('/home');
  };

  const register = useMutation({
    meta: handlesError,
    mutationFn: async ({ instance, params }: { instance: string; params: SignUpParams }) => {
      setErrors({});
      const account = await createAccount(instance, params);
      setPending(account);
      try {
        const session = await activate(account);
        if (session) await finish(session);
      } catch (err) {
        showError(t('auth.signUp.continueLater'), err instanceof Error ? err.message : undefined);
      }
    },
    onError: (err) => {
      if (needsWebSignUp(err)) return setNeedsWeb(true);
      setErrors(err instanceof MastoHttpError ? fieldErrors(err.details) : {});
      showError(t('auth.signUp.failed'), err.message || t('common.unknownError'));
    },
  });

  const check = useMutation({
    meta: handlesError,
    mutationFn: async () => {
      const session = await activate(pending!);
      if (session) await finish(session);
      else showToast(t('auth.signUp.notYet'));
    },
    onError: (err) => showError(t('auth.signUp.checkFailed'), err.message || t('common.unknownError')),
  });

  const resend = useMutation({
    meta: handlesError,
    mutationFn: () => resendConfirmation(pending!),
    onSuccess: () => showToast(t('auth.signUp.resent')),
    onError: (err) => showError(t('auth.signUp.resendFailed'), err.message || t('common.unknownError')),
  });

  return { pending, errors, needsWeb, register, check, resend };
}
