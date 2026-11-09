export type ServiceKind = 'appview' | 'chat' | 'moderation';

export type BskyServices = Partial<Record<ServiceKind, string>>;

export const SERVICE_KINDS: readonly ServiceKind[] = ['appview', 'chat', 'moderation'];

export const DEFAULT_SERVICES: Record<ServiceKind, string> = {
  appview: 'did:web:api.bsky.app#bsky_appview',
  chat: 'did:web:api.bsky.chat#bsky_chat',
  moderation: 'did:plc:ar7c4by46qjdydhdevvrndac#atproto_labeler',
};

const SERVICE_ID = /^did:(?:plc:[a-z2-7]{24}|web:[a-z0-9.%:-]+)#[a-z0-9_-]+$/i;

export const isServiceId = (value: string) => SERVICE_ID.test(value);

export function resolveServices(session: { services?: BskyServices }): Record<ServiceKind, string> {
  return { ...DEFAULT_SERVICES, ...session.services };
}

export function splitService(id: string) {
  const [did, type] = id.split('#');
  return { did, type };
}

export function cleanServices(value: unknown): BskyServices | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const input = value as Record<string, unknown>;
  const out: BskyServices = {};
  for (const kind of SERVICE_KINDS) {
    const entry = input[kind];
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (isServiceId(trimmed) && trimmed !== DEFAULT_SERVICES[kind]) out[kind] = trimmed;
  }
  return Object.keys(out).length ? out : undefined;
}

export const servicesKey = (session: { services?: BskyServices }) => JSON.stringify(resolveServices(session));
