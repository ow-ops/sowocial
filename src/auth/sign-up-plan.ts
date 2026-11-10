import { MastoHttpError, type MastoHttpErrorDetails } from 'masto';

export type SignUpField = 'username' | 'email' | 'password' | 'reason' | 'dateOfBirth' | 'agreement';
export type SignUpOutcome = 'ready' | 'pending' | 'confirm';
export type FieldError = { error: string; description: string };

type Registrations = {
  approvalRequired: boolean;
  reasonRequired?: boolean | null;
  minAge?: number | null;
};

export function signUpFields({ approvalRequired, reasonRequired, minAge }: Registrations) {
  return { reason: approvalRequired, reasonRequired: approvalRequired && !!reasonRequired, birthDate: !!minAge };
}

export const signUpOutcome = (approvalRequired: boolean, active: boolean): SignUpOutcome =>
  active ? 'ready' : approvalRequired ? 'pending' : 'confirm';

const FIELD_KEYS: Record<string, SignUpField> = {
  username: 'username',
  email: 'email',
  password: 'password',
  reason: 'reason',
  agreement: 'agreement',
  dateOfBirth: 'dateOfBirth',
  date_of_birth: 'dateOfBirth',
};

export function fieldErrors(details: MastoHttpErrorDetails | undefined) {
  const errors: Partial<Record<SignUpField, FieldError>> = {};
  for (const [key, list] of Object.entries(details ?? {})) {
    const field = FIELD_KEYS[key];
    if (field && list[0]) errors[field] = list[0];
  }
  return errors;
}

// A server without POST /api/v1/accounts answers 404 (or 403/405 when it refuses apps).
export const needsWebSignUp = (error: unknown) =>
  error instanceof MastoHttpError && [403, 404, 405].includes(error.statusCode);

const isGoToSocial = (sourceUrl?: string | null) => !!sourceUrl?.includes('gotosocial');

export const webSignUpUrl = (instance: string, sourceUrl?: string | null) =>
  `${instance}${isGoToSocial(sourceUrl) ? '/signup' : '/auth/sign_up'}`;

// GoToSocial has no POST /api/v1/emails/confirmations.
export const canResendConfirmation = (sourceUrl?: string | null) => !isGoToSocial(sourceUrl);

const pad = (n: number) => String(n).padStart(2, '0');

export const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function isOldEnough(birth: Date, minAge: number, now = new Date()) {
  const cutoff = new Date(birth.getFullYear() + minAge, birth.getMonth(), birth.getDate());
  return cutoff <= now;
}
