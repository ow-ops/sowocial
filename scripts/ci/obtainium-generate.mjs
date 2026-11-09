import { writeFileSync } from 'node:fs';
import { repository, server } from '../lib/forgejo.mjs';

const [version, tag, outputPath] = process.argv.slice(2);
if (!version || !tag || !outputPath) {
  console.error('Usage: obtainium-generate.mjs <version> <tag> <output-file>');
  process.exit(1);
}

const isNightly = tag.startsWith('nightly-');
const apkName = `sowocial-${version}-android-universal.apk`;
const apkUrl = `${server}/${repository}/releases/download/${tag}/${apkName}`;

const additionalSettings = {
  about: `A GoToSocial and Bluesky client${isNightly ? ' (nightly)' : ''}`,
  apkFilterRegEx: 'android-universal\\.apk$',
  fallbackToOlderReleases: true,
  ...(isNightly && {
    includePrereleases: true,
    filterReleaseTitlesByRegEx: '^Nightly build ',
  }),
};

const config = {
  apps: [
    {
      id: isNightly ? 'eu.owops.sowocial.nightly' : 'eu.owops.sowocial',
      url: `${server}/${repository}`,
      author: 'ow-ops',
      name: isNightly ? 'sowocial Nightly' : 'sowocial',
      installedVersion: null,
      latestVersion: version,
      apkUrls: JSON.stringify([[apkName, apkUrl]]),
      otherAssetUrls: '[]',
      preferredApkIndex: 0,
      additionalSettings: JSON.stringify(additionalSettings),
      lastUpdateCheck: null,
      pinned: false,
      categories: ['Communication'],
      releaseDate: null,
      changeLog: null,
      overrideSource: 'Codeberg',
      allowIdChange: false,
      pendingRepoRenameUrl: null,
    },
  ],
};

writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Generated ${outputPath} for ${apkName}`);
