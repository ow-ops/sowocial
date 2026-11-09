import { AppBskyRichtextFacet, RichText, type Agent } from '@atproto/api';

export async function detectRichText(agent: Agent, text: string) {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);
  const resolved = rt.facets?.filter((facet) =>
    facet.features.every((feature) => !AppBskyRichtextFacet.isMention(feature) || feature.did),
  );
  rt.facets = resolved?.length ? resolved : undefined;
  return rt;
}
