import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { forgejo as request } from '../lib/forgejo.mjs';

const getRelease = (tag) =>
  request('GET', `/releases/tags/${encodeURIComponent(tag)}`, { allow404: true });

async function requireRelease(tag) {
  const release = await getRelease(tag);
  if (!release) throw new Error(`Release ${tag} does not exist`);
  return release;
}

async function ensureRelease(tag, { sha, title, notes, prerelease }) {
  const existing = await getRelease(tag);
  if (existing) {
    console.log(`Reusing the existing ${tag} release.`);
    return;
  }
  await request('POST', '/releases', {
    json: {
      tag_name: tag,
      target_commitish: sha,
      name: title ?? tag,
      body: notes ?? '',
      draft: false,
      prerelease,
    },
  });
  console.log(`Created release ${tag}.`);
}

async function editRelease(tag, { title, notes, prerelease }) {
  const release = await requireRelease(tag);
  await request('PATCH', `/releases/${release.id}`, {
    json: {
      ...(title !== undefined && { name: title }),
      ...(notes !== undefined && { body: notes }),
      ...(prerelease !== undefined && { prerelease }),
    },
  });
  console.log(`Updated release ${tag}.`);
}

async function uploadAssets(tag, files) {
  const release = await requireRelease(tag);
  for (const file of files) {
    const name = basename(file);
    const stale = release.assets?.find((asset) => asset.name === name);
    if (stale) await request('DELETE', `/releases/${release.id}/assets/${stale.id}`);

    const form = new FormData();
    form.append('attachment', await openAsBlob(file), name);
    await request('POST', `/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
      body: form,
    });
    console.log(`Uploaded ${name}`);
  }
}

async function listReleases() {
  const releases = [];
  for (let page = 1; ; page += 1) {
    const batch = await request('GET', `/releases?limit=50&page=${page}`);
    if (!batch?.length) return releases;
    releases.push(...batch);
  }
}

async function pruneNightlies(keep, currentTag) {
  const nightlies = (await listReleases())
    .filter((release) => release.prerelease && release.tag_name.startsWith('nightly-'))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const release of nightlies.slice(keep)) {
    if (release.tag_name === currentTag) continue;
    await request('DELETE', `/releases/${release.id}`);
    await request('DELETE', `/tags/${encodeURIComponent(release.tag_name)}`, { allow404: true });
    console.log(`Pruned ${release.tag_name}`);
  }
}

const { values: flags, positionals } = parseArgs({
  options: Object.fromEntries(
    ['tag', 'sha', 'title', 'notes', 'prerelease', 'keep'].map((name) => [name, { type: 'string' }])
  ),
  allowPositionals: true,
});
const [command, ...files] = positionals;
const { tag } = flags;
const prerelease = flags.prerelease === undefined ? undefined : flags.prerelease === 'true';

switch (command) {
  case 'ensure':
    await ensureRelease(tag, { sha: flags.sha, title: flags.title, notes: flags.notes, prerelease });
    break;
  case 'edit':
    await editRelease(tag, { title: flags.title, notes: flags.notes, prerelease });
    break;
  case 'upload':
    await uploadAssets(tag, files);
    break;
  case 'prune': {
    const keep = Number(flags.keep);
    if (!Number.isInteger(keep) || keep <= 0) {
      console.error(`--keep must be a positive integer (got: ${flags.keep})`);
      process.exit(1);
    }
    await pruneNightlies(keep, tag);
    break;
  }
  default:
    console.error('Usage: forgejo-release.mjs <ensure|edit|upload|prune> [flags]');
    process.exit(1);
}
