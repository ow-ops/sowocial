import type { mastodon } from 'masto';

import type { PollDraft } from '@/api/backend/types';
import type { Poll } from '@/model/post';

export type PollLimits = mastodon.v2.InstanceConfiguration['polls'];

const EXPIRY_PRESETS = [300, 1800, 3600, 21600, 86400, 259200, 604800];

const DEFAULT_EXPIRY = 86400;

const MIN_OPTIONS = 2;

export const expiryChoices = (limits: PollLimits, current?: number) => {
  const choices = EXPIRY_PRESETS.filter((s) => s >= limits.minExpiration && s <= limits.maxExpiration);
  if (current && !choices.includes(current)) choices.push(current);
  return choices.sort((a, b) => a - b);
};

const closest = (choices: number[], target: number) =>
  choices.reduce((best, c) => (Math.abs(c - target) < Math.abs(best - target) ? c : best), choices[0] ?? target);

export const newPoll = (limits: PollLimits): PollDraft => ({
  options: Array<string>(MIN_OPTIONS).fill(''),
  multiple: false,
  hideTotals: false,
  expiresIn: closest(expiryChoices(limits), DEFAULT_EXPIRY),
});

// The model does not carry hide_totals; servers withhold every option's count while it is on.
export function pollToDraft(poll: Poll, limits?: PollLimits, now = Date.now()): PollDraft {
  const left = poll.expiresAt ? Math.floor((Date.parse(poll.expiresAt) - now) / 1000) : 0;
  const remaining = left > 0 ? left : DEFAULT_EXPIRY;
  return {
    options: poll.options.map((o) => o.title),
    multiple: poll.multiple,
    hideTotals: !poll.expired && poll.options.every((o) => o.votesCount == null),
    expiresIn: limits ? Math.min(Math.max(remaining, limits.minExpiration), limits.maxExpiration) : remaining,
  };
}

const filled = (poll: PollDraft) => poll.options.map((o) => o.trim()).filter(Boolean);

export function isPollValid(poll: PollDraft, limits: PollLimits) {
  const options = filled(poll);
  return (
    options.length >= MIN_OPTIONS &&
    options.length <= limits.maxOptions &&
    new Set(options).size === options.length &&
    options.every((o) => o.length <= limits.maxCharactersPerOption)
  );
}

export const toPollParams = (poll: PollDraft) => ({
  options: filled(poll),
  expiresIn: poll.expiresIn,
  multiple: poll.multiple,
  hideTotals: poll.hideTotals,
});

export const hasPollInput = (poll: PollDraft | null | undefined) => !!poll && poll.options.some((o) => o.trim());
