import { MastoHttpError } from 'masto';

export const isUnsupported = (error: unknown) => error instanceof MastoHttpError && error.statusCode === 404;
