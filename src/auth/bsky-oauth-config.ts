import nativeMetadata from '../../public/oauth-client-metadata.json';
import webMetadata from '../../public/oauth-client-metadata-web.json';

export const PRODUCTION_ORIGIN = 'https://sowocial.ow-ops.eu';
const CALLBACK_PATH = '/oauth/callback';

export const nativeClientMetadata = nativeMetadata;
export const webClientMetadata = webMetadata;

type Where = { origin: string; hostname: string; port: string };

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];

export function buildLoopbackClientId({ port }: Pick<Where, 'port'>, scope: string = nativeMetadata.scope) {
  const params = new URLSearchParams({
    redirect_uri: `http://127.0.0.1${port ? `:${port}` : ''}${CALLBACK_PATH}`,
    scope,
  });
  return `http://localhost?${params}`;
}

export function oauthClientId(platform: string, where?: Where): string | null {
  if (platform !== 'web') return nativeMetadata.client_id;
  if (!where) return null;
  if (where.origin === PRODUCTION_ORIGIN) return webMetadata.client_id;
  if (LOOPBACK_HOSTS.includes(where.hostname)) return buildLoopbackClientId(where);
  return null;
}

export const oauthAvailable = (platform: string, where?: Where) => oauthClientId(platform, where) !== null;

export function loopbackIpHref(location: Where & { href: string }) {
  if (location.hostname !== 'localhost') return null;
  const url = new URL(location.href);
  url.hostname = '127.0.0.1';
  return url.href;
}
