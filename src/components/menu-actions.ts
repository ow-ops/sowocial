import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAccountModeration, useBlockDomain, useRelationship } from '@/api/accounts';
import { useInstance } from '@/api/ap/instance';
import { hideTranslation, useCanTranslate, useShownTranslation, useTranslatePost } from '@/api/ap/translate';
import { useEndorseAccount, useFollowOptions } from '@/api/ap/profile-extras';
import { useDeleteStatus, useSeedStatus, useStatusToggle } from '@/api/statuses';
import { capabilitiesFor } from '@/api/backend/capabilities';
import { isForeign } from '@/api/clients';
import { accountKey } from '@/auth/account-key';
import { useActingKey, useAuthedSession, useSession } from '@/auth/session';
import type { Author, Post, Relationship } from '@/model/post';
import { domainOf, fullHandle } from '@/utils/acct';
import { confirmAction } from '@/utils/dialog';
import { tapHaptic } from '@/utils/haptics';
import { openLink } from '@/utils/open-link';
import { useOverlay, type OverlayRequest } from '@/overlay/store';
import { copyText, shareUrl } from '@/utils/share';
import { showError } from '@/utils/toast';

export type MenuAction = {
  key: string;
  title: string;
  // SF Symbol name; the Android menu is text only.
  icon: string;
  detail?: string;
  destructive?: boolean;
  onPress: () => void;
};

export type MenuGroup = { key: 'own' | 'post' | 'account' | 'share' | 'moderation' | 'replies'; items: MenuAction[] };

type MenuOptions = { sheet?: boolean };

const SHEET_DISMISS_MS = 400;

const close = () => (router.canGoBack() ? router.back() : undefined);

function useMenuContext({ sheet }: MenuOptions) {
  const { t } = useTranslation();
  const acting = useActingKey();
  const { session } = useSession();
  const account = acting && session && acting !== accountKey(session) ? acting : undefined;
  const withAccount = (href: Href): Href =>
    account && typeof href === 'object' ? ({ ...href, params: { ...href.params, account } } as Href) : href;
  return {
    t,
    go: (href: Href) => (sheet ? router.replace(withAccount(href)) : router.push(withAccount(href))),
    present: (request: OverlayRequest) => {
      const open = () => useOverlay.getState().open({ ...request, acting: account });
      if (!sheet) return open();
      close();
      setTimeout(open, SHEET_DISMISS_MS);
    },
    mutate: {
      onError: (error: Error) => showError(t('status.menu.failed'), error.message),
      onSuccess: sheet ? close : undefined,
    },
  };
}

const confirmed = (action: () => void) => () => {
  tapHaptic();
  action();
};

function useModerationActions(
  account: Author,
  relationship: Relationship | null | undefined,
  options: MenuOptions & { statusId?: string },
): MenuAction[] {
  const { t, go, present, mutate } = useMenuContext(options);
  const moderate = useAccountModeration(account.id);
  const blockDomain = useBlockDomain();
  const capabilities = capabilitiesFor(account.protocol);
  const handle = `@${account.handle}`;
  const domain = capabilities.domainBlocks ? domainOf(account.handle) : '';

  const actions: MenuAction[] = [
    {
      key: 'mute',
      title: relationship?.muting ? t('status.menu.unmute', { handle }) : t('status.menu.mute', { handle }),
      detail: relationship?.muting ? undefined : t('profile.moderation.muteDetail'),
      icon: relationship?.muting ? 'speaker.wave.2' : 'speaker.slash',
      onPress: () =>
        relationship?.muting || !capabilities.muteOptions
          ? moderate.mutate(relationship?.muting ? 'unmute' : 'mute', mutate)
          : present({ kind: 'mute', accountId: account.id }),
    },
    {
      key: 'block',
      title: relationship?.blocking ? t('status.menu.unblock', { handle }) : t('status.menu.block', { handle }),
      detail: relationship?.blocking ? undefined : t('profile.moderation.blockDetail'),
      icon: 'hand.raised',
      destructive: !relationship?.blocking,
      onPress: () =>
        relationship?.blocking
          ? moderate.mutate('unblock', mutate)
          : confirmAction(
              t('status.menu.blockConfirm', { handle }),
              t('status.menu.blockAction'),
              confirmed(() => moderate.mutate('block', mutate)),
            ),
    },
  ];
  actions.push({
    key: 'report',
    title: t('status.menu.report', { handle }),
    icon: 'flag',
    destructive: true,
    onPress: () =>
      go({ pathname: '/report/[accountId]', params: { accountId: account.id, statusId: options.statusId } }),
  });
  if (domain) {
    actions.push({
      key: 'blockDomain',
      title: t('status.menu.blockDomain', { domain }),
      detail: t('profile.moderation.blockDomainDetail'),
      icon: 'nosign',
      destructive: true,
      onPress: () =>
        confirmAction(
          t('status.menu.blockDomainConfirm', { domain }),
          t('status.menu.blockDomainAction'),
          confirmed(() => blockDomain.mutate(domain, mutate)),
        ),
    });
  }
  return actions;
}

export function useStatusActions(status: Post, options: MenuOptions = {}): MenuGroup[] {
  const { t, go, mutate } = useMenuContext(options);
  const session = useAuthedSession();
  const { sessions } = useSession();
  const seed = useSeedStatus();
  const remove = useDeleteStatus();
  const toggle = useStatusToggle();
  const moderation = useModerationActions(status.author, undefined, { ...options, statusId: status.id });
  const canTranslate = useCanTranslate(status);
  const translation = useShownTranslation(status.uid);
  const translate = useTranslatePost(status.accountKey);

  const foreign = isForeign(status, accountKey(session));
  const owner = foreign ? sessions.find((s) => accountKey(s) === status.accountKey) : session;
  const own = status.author.id === owner?.accountId;
  const { url } = status;
  const pinnable =
    own && status.capabilities.pin && (status.protocol === 'bsky' || status.visibility === 'public' || status.visibility === 'unlisted');

  const groups: MenuGroup[] = [];
  if (own) {
    const items: MenuAction[] = [];
    if (status.capabilities.edit && !foreign) {
      items.push({
        key: 'edit',
        title: t('common.edit'),
        icon: 'pencil',
        onPress: () => {
          seed(status);
          go({ pathname: '/compose', params: { edit: status.id } });
        },
      });
    }
    if (pinnable) {
      items.push({
        key: 'pin',
        title: status.viewer.pinned ? t('status.menu.unpin') : t('status.menu.pin'),
        icon: status.viewer.pinned ? 'pin.slash' : 'pin',
        onPress: () => toggle.mutate({ status, toggle: 'pin' }, mutate),
      });
    }
    items.push({
      key: 'delete',
      title: t('common.delete'),
      icon: 'trash',
      destructive: true,
      onPress: () =>
        confirmAction(
          t('status.menu.deleteConfirm'),
          t('common.delete'),
          confirmed(() => remove.mutate(status, mutate)),
        ),
    });
    groups.push({ key: 'own', items });
  }
  groups.push({
    key: 'post',
    items: [
      ...(status.capabilities.muteThread && !foreign
        ? [
            {
              key: 'muteConversation',
              title: status.viewer.muted ? t('status.menu.unmuteConversation') : t('status.menu.muteConversation'),
              detail: status.viewer.muted ? undefined : t('timeline.statusMenu.muteHint'),
              icon: status.viewer.muted ? 'bell' : 'bell.slash',
              onPress: () => toggle.mutate({ status, toggle: 'mute' }, mutate),
            },
          ]
        : []),
      ...(canTranslate
        ? [
            {
              key: 'translate',
              title: translation ? t('status.translate.showOriginal') : t('status.translate.action'),
              icon: 'translate',
              onPress: () => (translation ? hideTranslation(status.uid) : translate.mutate(status)),
            },
          ]
        : []),
      {
        key: 'share',
        title: t('common.share'),
        icon: 'square.and.arrow.up',
        onPress: () => shareUrl(url),
      },
      ...(status.protocol === 'bsky' && !foreign
        ? [
            {
              key: 'quote',
              title: t('status.menu.quote'),
              icon: 'quote.bubble',
              onPress: () => {
                seed(status);
                go({ pathname: '/compose', params: { quote: status.id } });
              },
            },
          ]
        : []),
      {
        key: 'browser',
        title: t('status.menu.openInBrowser'),
        icon: 'safari',
        onPress: () => openLink(url),
      },
    ],
  });
  if (!own && !foreign) groups.push({ key: 'moderation', items: moderation });
  return groups;
}

export function useAccountActions(account: Author, options: MenuOptions & { own?: boolean } = {}): MenuGroup[] {
  const { t, present, mutate } = useMenuContext(options);
  const { signOut } = useSession();
  const { data: relationship } = useRelationship(account.id);
  const followOptions = useFollowOptions(account.id);
  const endorse = useEndorseAccount(account.id);
  const moderation = useModerationActions(account, relationship, options);
  const domain = useInstance().data?.domain;
  const handle = `@${fullHandle(account.handle, account.protocol === 'ap' ? domain : undefined)}`;

  const share: MenuGroup = {
    key: 'share',
    items: [
      {
        key: 'copyHandle',
        title: t('status.menu.copyHandle'),
        detail: handle,
        icon: 'at',
        onPress: () => copyText(handle),
      },
      {
        key: 'browser',
        title: t('status.menu.openInBrowser'),
        icon: 'safari',
        onPress: () => openLink(account.url),
      },
      { key: 'copyLink', title: t('status.menu.copyLink'), icon: 'link', onPress: () => copyText(account.url) },
      { key: 'share', title: t('common.share'), icon: 'square.and.arrow.up', onPress: () => shareUrl(account.url) },
      {
        key: 'qr',
        title: t('status.menu.qrCode'),
        icon: 'qrcode',
        onPress: () => present({ kind: 'qr', accountId: account.id, handle }),
      },
    ],
  };
  if (options.own) {
    const own: MenuGroup = {
      key: 'own',
      items: [
        { key: 'more', title: t('profile.header.more'), icon: 'ellipsis.circle', onPress: () => router.push('/more') },
        { key: 'settings', title: t('profile.header.settings'), icon: 'gearshape', onPress: () => router.push('/settings') },
        {
          key: 'signOut',
          title: t('profile.header.signOut'),
          icon: 'rectangle.portrait.and.arrow.right',
          destructive: true,
          onPress: () => confirmAction(t('profile.signOut.title'), t('profile.signOut.action'), signOut),
        },
      ],
    };
    return [own, share];
  }

  const groups: MenuGroup[] = [];
  const capabilities = capabilitiesFor(account.protocol);
  const accountItems: MenuAction[] = [];
  if (capabilities.lists) {
    accountItems.push({
      key: 'addToList',
      title: t('status.menu.addToList'),
      icon: 'list.bullet',
      onPress: () => router.push({ pathname: '/lists/add/[accountId]', params: { accountId: account.id } }),
    });
  }
  if (capabilities.followOptions && relationship?.following) {
    const reblogs = relationship.showingReblogs ?? true;
    const notify = relationship.notifying ?? false;
    accountItems.push(
      {
        key: 'reblogs',
        title: reblogs ? t('profile.followOptions.hideBoosts') : t('profile.followOptions.showBoosts'),
        icon: 'arrow.2.squarepath',
        onPress: () => followOptions.mutate({ reblogs: !reblogs, notify }, mutate),
      },
      {
        key: 'notify',
        title: notify ? t('profile.followOptions.stopNotify') : t('profile.followOptions.notify'),
        icon: notify ? 'bell.slash' : 'bell',
        onPress: () => followOptions.mutate({ reblogs, notify: !notify }, mutate),
      },
      {
        key: 'endorse',
        title: relationship.endorsed ? t('profile.followOptions.unfeature') : t('profile.followOptions.feature'),
        icon: relationship.endorsed ? 'star.slash' : 'star',
        onPress: () => endorse.mutate(!relationship.endorsed, mutate),
      },
    );
  }
  if (accountItems.length) groups.push({ key: 'account', items: accountItems });
  groups.push(share, { key: 'moderation', items: moderation });
  return groups;
}
