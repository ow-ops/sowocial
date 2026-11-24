import { MastoHttpError } from 'masto';

import { isAtprotoAuthFailure, isAuthFailure, isInvalidTokenResponse, isMastoAuthFailure } from '@/auth/auth-failure';

jest.mock('masto', () => ({
  MastoHttpError: class extends Error {
    statusCode: number;
    constructor({ statusCode, message }: { statusCode: number; message: string }) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

const masto = (statusCode: number, message: string) => new MastoHttpError({ statusCode, message });

describe('auth failure classification', () => {
  it('flags masto 401s from credential checks and token errors', () => {
    expect(isMastoAuthFailure(masto(401, 'The access token is invalid'))).toBe(true);
    expect(isMastoAuthFailure(masto(401, 'Unauthorized'), ['credentials'])).toBe(true);
  });

  it('ignores other masto errors', () => {
    expect(isMastoAuthFailure(masto(401, 'Unauthorized'), ['timeline'])).toBe(false);
    expect(isMastoAuthFailure(masto(403, 'invalid token'))).toBe(false);
    expect(isMastoAuthFailure(new Error('token'))).toBe(false);
  });

  it('flags atproto expired and invalid token responses only', () => {
    expect(isAtprotoAuthFailure({ status: 401, error: 'ExpiredToken' })).toBe(true);
    expect(isAtprotoAuthFailure({ status: 400, error: 'InvalidToken' })).toBe(false);
    expect(isAtprotoAuthFailure({ status: 401, error: 'InvalidToken' })).toBe(true);
    expect(isAtprotoAuthFailure({ status: 401, error: 'Other' })).toBe(false);
    expect(isAtprotoAuthFailure(null)).toBe(false);
  });

  it('classifies by the failing account protocol', () => {
    const expired = { status: 401, error: 'ExpiredToken' };
    expect(isAuthFailure('bsky', expired)).toBe(true);
    expect(isAuthFailure('ap', expired)).toBe(false);
    expect(isAuthFailure('bsky', masto(401, 'bad token'))).toBe(false);
    expect(isAuthFailure('ap', masto(401, 'bad token'))).toBe(true);
  });
});

describe('isInvalidTokenResponse', () => {
  const unauthorized = (wwwAuthenticate?: string) => ({
    status: 401,
    headers: new Headers(wwwAuthenticate ? { 'WWW-Authenticate': wwwAuthenticate } : {}),
  });

  it('flags the 401 the oauth client returns when its refresh failed', () => {
    expect(isInvalidTokenResponse(unauthorized('DPoP error="invalid_token"'))).toBe(true);
  });

  it('ignores other 401s', () => {
    expect(isInvalidTokenResponse(unauthorized())).toBe(false);
    expect(isInvalidTokenResponse(unauthorized('DPoP error="use_dpop_nonce"'))).toBe(false);
  });
});
