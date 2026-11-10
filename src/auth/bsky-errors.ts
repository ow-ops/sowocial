import { t } from '@/i18n';

type Details = { status?: unknown; error?: unknown; params?: unknown; message?: unknown; cause?: unknown };

const NETWORK_MESSAGE = /failed to fetch|fetch failed|network request failed|networkerror|load failed/i;
const WRONG_PASSWORD = new Set(['InvalidRequest', 'AuthenticationRequired']);
const BLUESKY_HOST = /(^|\.)(bsky\.social|bsky\.network)$/i;

const details = (error: unknown): Details => (typeof error === 'object' && error !== null ? error : {});

function chain(error: unknown) {
  const out: unknown[] = [];
  for (let current = error; current !== undefined && out.length < 5; current = details(current).cause) out.push(current);
  return out;
}

function oauthCode(error: unknown) {
  for (const link of chain(error)) {
    const { error: code, params } = details(link);
    if (typeof code === 'string') return code;
    if (params instanceof URLSearchParams && params.get('error')) return params.get('error');
  }
  return null;
}

export function isScopeMissing(status: number, body: unknown) {
  const { error, message } = details(body);
  return status === 403 && (error === 'ScopeMissingError' || /missing required scope/i.test(String(message ?? '')));
}

export const scopeMissingError = (cause?: unknown) => new Error(t('auth.errors.scopeMissing'), { cause });

export function isNetworkFailure(error: unknown) {
  return chain(error).some((link) => {
    const { status, message } = details(link);
    return (
      link instanceof TypeError ||
      status === 0 ||
      status === 1 ||
      (link instanceof Error && NETWORK_MESSAGE.test(String(message)))
    );
  });
}

export function isOAuthCancelled(error: unknown) {
  return (
    oauthCode(error) === 'access_denied' ||
    chain(error).some((link) => link instanceof Error && /cancel/i.test(link.message))
  );
}

export function isSelfHosted(server: string) {
  try {
    return !BLUESKY_HOST.test(new URL(/^https?:\/\//i.test(server) ? server : `https://${server}`).hostname);
  } catch {
    return false;
  }
}

function isWrongPassword(error: unknown) {
  return chain(error).some((link) => {
    const { status, error: code } = details(link);
    return status === 401 || (typeof code === 'string' && WRONG_PASSWORD.has(code));
  });
}

type Context = { server: string; oauth?: boolean };

export function describeBskyError(error: unknown, { server, oauth = false }: Context) {
  const message = (text: string) => new Error(text, { cause: error });
  if (isNetworkFailure(error)) {
    if (!server) return message(t('auth.errors.unreachableGeneric'));
    return message(t(oauth ? 'auth.errors.unreachableOauth' : 'auth.errors.unreachable', { server }));
  }
  if (!oauth) {
    if (isWrongPassword(error)) {
      return message(t(isSelfHosted(server) ? 'auth.errors.wrongPasswordSelfHosted' : 'auth.errors.wrongPassword'));
    }
    return error instanceof Error ? error : message(String(error));
  }
  if (isOAuthCancelled(error)) return message(t('auth.errors.cancelled'));
  const code = oauthCode(error);
  if (code === 'invalid_client') return message(t('auth.errors.clientRejected'));
  if (code === 'invalid_scope') return message(t('auth.errors.scopeRejected'));
  return error instanceof Error ? error : message(String(error));
}
