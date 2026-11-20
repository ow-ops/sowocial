import { isRestorable, clearReturnTo, rememberReturnTo, returnTo } from '@/auth/return-to';

describe('isRestorable', () => {
  it('accepts app paths with a query', () => {
    expect(isRestorable('/post/42')).toBe(true);
    expect(isRestorable('/compose?text=hi')).toBe(true);
    expect(isRestorable('/open?url=https%3A%2F%2Fexample.social%2Fx')).toBe(true);
  });

  it('rejects routes a signed-out visitor can already open', () => {
    for (const href of ['/', '/login', '/login?x=1', '/sign-up', '/oauth/callback']) expect(isRestorable(href)).toBe(false);
  });

  it('rejects anything that leaves the app', () => {
    for (const href of ['https://evil.example/x', '//evil.example/x', '/\\evil.example', 'sowocial://post/1', 'post/1', '']) {
      expect(isRestorable(href)).toBe(false);
    }
  });
});

describe('returnTo', () => {
  afterEach(clearReturnTo);

  it('holds the remembered path until cleared', () => {
    rememberReturnTo('/post/42');
    expect(returnTo()).toBe('/post/42');
    clearReturnTo();
    expect(returnTo()).toBeNull();
  });

  it('keeps the first path when later ones are not restorable', () => {
    rememberReturnTo('/post/42');
    rememberReturnTo('/login');
    expect(returnTo()).toBe('/post/42');
  });
});
