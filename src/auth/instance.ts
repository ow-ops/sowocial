import { t } from '@/i18n';

import { cleanServices } from './bsky-services';
import type { ApSession, BskySession, Session } from './types';

export function normalizeInstance(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const match = withScheme.match(/^(https?:\/\/[^/?#\s]+)/i);
  if (!match) throw new Error(t('auth.errors.enterServer'));
  return match[1].toLowerCase();
}

const DISCOVERY_TIMEOUT_MS = 5000;

const handleDomain = (input: string) => {
  const trimmed = input.trim().replace(/^@/, '');
  const at = trimmed.lastIndexOf('@');
  return !/^https?:\/\//i.test(trimmed) && at > 0 ? trimmed.slice(at + 1) : trimmed;
};

const originOf = (url: string | undefined) => {
  if (!url) return undefined;
  try {
    const { origin } = new URL(url);
    return origin && origin !== 'null' ? origin.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
};

async function fetchText(url: string, fetchFn: typeof fetch): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json, application/xrd+xml' } });
    return response.ok ? await response.text() : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function nodeinfoOrigin(base: string, fetchFn: typeof fetch) {
  const body = await fetchText(`${base}/.well-known/nodeinfo`, fetchFn);
  if (!body) return undefined;
  try {
    const links = (JSON.parse(body) as { links?: { href?: string }[] }).links ?? [];
    return links.map((link) => originOf(link.href)).find(Boolean);
  } catch {
    return undefined;
  }
}

async function hostMetaOrigin(base: string, fetchFn: typeof fetch) {
  const body = await fetchText(`${base}/.well-known/host-meta`, fetchFn);
  const template = body?.match(/rel=["']lrdd["'][^>]*template=["']([^"']+)["']|template=["']([^"']+)["'][^>]*rel=["']lrdd["']/i);
  return originOf(template?.[1] ?? template?.[2]);
}

export async function discoverInstance(input: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const base = normalizeInstance(handleDomain(input));
  return (await nodeinfoOrigin(base, fetchFn)) ?? (await hostMetaOrigin(base, fetchFn)) ?? base;
}

export function isSession(value: unknown): value is Omit<ApSession, 'protocol'> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.instance === 'string' && typeof v.token === 'string' && typeof v.accountId === 'string';
}

function isBskySession(v: Record<string, unknown>): v is BskySession {
  return (
    typeof v.did === 'string' &&
    typeof v.handle === 'string' &&
    typeof v.pds === 'string' &&
    (v.auth === 'oauth' || v.auth === 'app-password')
  );
}

export function parseSession(value: unknown): Session | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.protocol === 'bsky') return isBskySession(v) ? { ...v, services: cleanServices(v.services) } : null;
  return isSession(value) ? { ...value, protocol: 'ap' } : null;
}
