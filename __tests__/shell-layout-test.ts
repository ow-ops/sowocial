import { shellLayout } from '@/hooks/use-column';

describe('shellLayout', () => {
  it('has no rail below 1024', () => {
    expect(shellLayout(1023)).toMatchObject({ rail: false, railWidth: 0, feedWidth: 1023 });
  });

  it('keeps the rail beside a centred feed column', () => {
    expect(shellLayout(1024)).toEqual({ rail: true, railWidth: 248, feedWidth: 776, margin: 0 });
    expect(shellLayout(1999)).toEqual({ rail: true, railWidth: 679, feedWidth: 1320, margin: 0 });
  });

  it('keeps the rail narrow in columns mode', () => {
    expect(shellLayout(1920, true)).toEqual({ rail: true, railWidth: 248, feedWidth: 1672, margin: 0 });
  });
});
