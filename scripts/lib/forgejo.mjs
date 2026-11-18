export const server = (process.env.FORGEJO_URL ?? 'https://git.ow-ops.eu').replace(/\/+$/, '');
export const repository = process.env.FORGEJO_REPOSITORY ?? 'ow-ops/sowocial';

