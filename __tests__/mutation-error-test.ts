import { handlesError } from '@/api/mutation-meta';
import { createQueryClient } from '@/api/query-client';
import { showError } from '@/utils/toast';

jest.mock('@/utils/toast', () => ({ showError: jest.fn() }));

const client = createQueryClient();

const fail = (meta?: Record<string, unknown>) =>
  client
    .getMutationCache()
    .build(client, { mutationFn: () => Promise.reject(new Error('boom')), gcTime: Infinity, meta })
    .execute(undefined)
    .catch(() => {});

describe('mutation error reporting', () => {
  beforeEach(() => jest.mocked(showError).mockClear());
  afterAll(() => client.clear());

  it('notifies once for a failing mutation', async () => {
    await fail();
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith('Something went wrong', 'boom');
  });

  it('stays silent when the mutation handles its own error', async () => {
    await fail(handlesError);
    expect(showError).not.toHaveBeenCalled();
  });
});
