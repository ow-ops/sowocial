import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MastoHttpError, type mastodon } from 'masto';

import { accountKey } from '@/auth/account-key';
import { useAuthedSession } from '@/auth/session';

import { useCapabilities } from '../backend';
import { getMasto } from '../clients';
import { keys } from '../keys';
import { handlesError, toastFailure } from '../mutation-meta';
import { t } from '@/i18n';
import { showToast } from '@/utils/toast';

import { useServerFeatures } from './server';
import { canModerate } from './server-detect';

// A 403 from the admin API means the token was issued without the moderation scopes.
export const lacksModerationScopes = (error: unknown) => error instanceof MastoHttpError && error.statusCode === 403;

// Reports and their accounts are read and written with the granular admin scopes from MODERATION_SCOPES.
export function useCanModerate() {
  const { serverInfo } = useCapabilities();
  const software = useServerFeatures().data?.software;
  // Shares the credentials query with usePostingDefaults: the public account object has no role permissions.
  const { data: role } = useQuery({
    queryKey: keys.credentials,
    queryFn: () => getMasto().v1.accounts.verifyCredentials(),
    enabled: serverInfo,
    select: (account) => account.role,
  });
  return !!role && !!software && canModerate(role, software);
}

export function useOpenReports() {
  const session = useAuthedSession();
  return useQuery({
    queryKey: keys.moderationReports(accountKey(session)),
    queryFn: async () => await getMasto().v1.admin.reports.list({ resolved: false }),
  });
}

export function useReport(id: string) {
  const session = useAuthedSession();
  return useQuery({
    queryKey: keys.moderationReport(accountKey(session), id),
    queryFn: () => getMasto().v1.admin.reports.$select(id).fetch(),
  });
}

export type ReportAction = 'resolve' | 'reopen' | 'assignToSelf';
export type AccountAction = 'silence' | 'suspend' | 'disable';

// Account actions run from least to most severe. GoToSocial has no reopen, self-assignment, silence or disable.
export function availableActions(
  report: Pick<mastodon.v1.admin.Report, 'actionTaken' | 'assignedAccount'>,
  selfId: string | undefined,
  gotosocial: boolean,
): { report: ReportAction[]; account: AccountAction[] } {
  const reportActions: ReportAction[] = [];
  if (!report.actionTaken) reportActions.push('resolve');
  else if (!gotosocial) reportActions.push('reopen');
  if (!gotosocial && selfId && report.assignedAccount?.id !== selfId) reportActions.push('assignToSelf');
  return { report: reportActions, account: gotosocial ? ['suspend'] : ['silence', 'disable', 'suspend'] };
}

export function commentExcerpt(comment: string, max = 80) {
  const text = comment.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function useSelfAccountId() {
  const { serverInfo } = useCapabilities();
  return useQuery({
    queryKey: keys.credentials,
    queryFn: () => getMasto().v1.accounts.verifyCredentials(),
    enabled: serverInfo,
    select: (account) => account.id,
  }).data;
}

function useRefreshModeration(reportId: string) {
  const queryClient = useQueryClient();
  const accountKeyValue = accountKey(useAuthedSession());
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.moderationReport(accountKeyValue, reportId) }),
      queryClient.invalidateQueries({ queryKey: keys.moderationReports(accountKeyValue) }),
    ]);
}

export function useModerateReport(id: string) {
  const queryClient = useQueryClient();
  const session = useAuthedSession();
  const refresh = useRefreshModeration(id);
  return useMutation({
    meta: handlesError,
    mutationFn: (action: ReportAction) => getMasto().v1.admin.reports.$select(id)[action](),
    onError: (error) => toastFailure('moderation.failed', error),
    onSuccess: (report, action) => {
      queryClient.setQueryData(keys.moderationReport(accountKey(session), id), report);
      showToast(t(`moderation.done.${action}`));
      return refresh();
    },
  });
}

export function useAccountAction(reportId: string, accountId: string) {
  const refresh = useRefreshModeration(reportId);
  return useMutation({
    meta: handlesError,
    mutationFn: (type: AccountAction) => getMasto().v1.admin.accounts.$select(accountId).action.create({ type, reportId }),
    onError: (error) => toastFailure('moderation.failed', error),
    onSuccess: (_, type) => {
      showToast(t(`moderation.done.${type}`));
      return refresh();
    },
  });
}
