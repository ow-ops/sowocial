import { MastoHttpError } from 'masto';

import {
  canResendConfirmation,
  fieldErrors,
  isOldEnough,
  needsWebSignUp,
  signUpFields,
  signUpOutcome,
  toIsoDate,
  webSignUpUrl,
} from '@/auth/sign-up-plan';

jest.mock('masto', () => ({
  MastoHttpError: class extends Error {
    statusCode: number;
    constructor({ statusCode, message }: { statusCode: number; message: string }) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

const http = (statusCode: number) => new MastoHttpError({ statusCode, message: 'x' });

describe('signUpFields', () => {
  it('asks for a reason only when approval is required', () => {
    expect(signUpFields({ approvalRequired: false, reasonRequired: true })).toEqual({ reason: false, reasonRequired: false, birthDate: false });
    expect(signUpFields({ approvalRequired: true, reasonRequired: true })).toEqual({ reason: true, reasonRequired: true, birthDate: false });
    expect(signUpFields({ approvalRequired: true, reasonRequired: false })).toMatchObject({ reason: true, reasonRequired: false });
  });

  it('asks for a birth date when the server has a minimum age', () => {
    expect(signUpFields({ approvalRequired: false, minAge: 16 }).birthDate).toBe(true);
    expect(signUpFields({ approvalRequired: false, minAge: null }).birthDate).toBe(false);
  });
});

describe('signUpOutcome', () => {
  it('maps the account state', () => {
    expect(signUpOutcome(false, true)).toBe('ready');
    expect(signUpOutcome(true, false)).toBe('pending');
    expect(signUpOutcome(false, false)).toBe('confirm');
  });
});

describe('fieldErrors', () => {
  it('maps server details to form fields', () => {
    const errors = fieldErrors({
      username: [{ error: 'ERR_TAKEN', description: 'has already been taken' }],
      date_of_birth: [{ error: 'ERR_BLANK', description: "can't be blank" }],
      unknown: [{ error: 'ERR_INVALID', description: 'bad' }],
    });
    expect(errors).toEqual({
      username: { error: 'ERR_TAKEN', description: 'has already been taken' },
      dateOfBirth: { error: 'ERR_BLANK', description: "can't be blank" },
    });
  });

  it('handles missing details', () => {
    expect(fieldErrors(undefined)).toEqual({});
  });
});

describe('needsWebSignUp', () => {
  it('flags servers without the registration endpoint', () => {
    expect(needsWebSignUp(http(404))).toBe(true);
    expect(needsWebSignUp(http(403))).toBe(true);
    expect(needsWebSignUp(http(422))).toBe(false);
    expect(needsWebSignUp(new Error('offline'))).toBe(false);
  });
});

describe('webSignUpUrl', () => {
  it('uses the server software sign-up page', () => {
    expect(webSignUpUrl('https://a.example', 'https://codeberg.org/superseriousbusiness/gotosocial')).toBe('https://a.example/signup');
    expect(webSignUpUrl('https://a.example', 'https://github.com/mastodon/mastodon')).toBe('https://a.example/auth/sign_up');
  });
});

describe('canResendConfirmation', () => {
  it('is off for GoToSocial only', () => {
    expect(canResendConfirmation('https://codeberg.org/superseriousbusiness/gotosocial')).toBe(false);
    expect(canResendConfirmation('https://github.com/mastodon/mastodon')).toBe(true);
    expect(canResendConfirmation(null)).toBe(true);
  });
});

describe('toIsoDate', () => {
  it('formats local date parts', () => {
    expect(toIsoDate(new Date(2000, 1, 9))).toBe('2000-02-09');
  });
});

describe('isOldEnough', () => {
  const now = new Date(2026, 5, 15);
  it('counts the birthday itself', () => {
    expect(isOldEnough(new Date(2010, 5, 15), 16, now)).toBe(true);
    expect(isOldEnough(new Date(2010, 5, 16), 16, now)).toBe(false);
    expect(isOldEnough(new Date(1990, 0, 1), 16, now)).toBe(true);
  });
});
