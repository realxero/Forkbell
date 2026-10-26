// app.json holds the app's settings; this adds the parts that change per build.
// The version comes from the root package.json (scripts/set-version.mjs sets
// it), and the build number from FORKBELL_BUILD_NUMBER (the iOS workflow uses
// its run number), so iOS shows e.g. "Version 0.11.0 (42)".
const { version } = require('../../package.json');

const build = /^\d{1,9}$/.test(process.env.FORKBELL_BUILD_NUMBER ?? '') ? process.env.FORKBELL_BUILD_NUMBER : '1';

module.exports = ({ config }) => ({
  ...config,
  version,
  ios: { ...config.ios, buildNumber: build },
  android: { ...config.android, versionCode: Number(build) },
});
