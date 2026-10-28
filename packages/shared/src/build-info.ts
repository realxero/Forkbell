// Rewritten by scripts/build-info.mjs when the server image or the iOS app is
// built, with the commit and build number filled in. The version here must
// match the root package.json (a test checks); change it with
// `node scripts/set-version.mjs <version>`.
export const BUILD_INFO = {
  version: '0.21.0',
  commit: null as string | null,
  buildNumber: null as string | null,
  builtAt: null as string | null,
};
