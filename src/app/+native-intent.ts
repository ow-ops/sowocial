// iOS share opens sowocial://dataUrl=<key>, which is not a route; expo-share-intent reads it.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path.includes('dataUrl=') || path.startsWith('eu.ow-ops.sowocial:') ? '/' : path;
}
