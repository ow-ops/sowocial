export const handlesError = { handlesError: true } as const;

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { handlesError?: boolean };
  }
}
