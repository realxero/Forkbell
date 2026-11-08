import { BUILD_INFO } from './build-info.ts';

type BuildInfo = typeof BUILD_INFO;

/** This copy of Forkbell: the app or the server, whichever imports it. */
export { BUILD_INFO as BUILD };

/** "0.11.0 (build 42, a1b2c3d)", or "0.11.0 (dev)" for a build from a working copy. */
export function versionLabel(b: BuildInfo) {
  const bits = [b.buildNumber && `build ${b.buildNumber}`, b.commit?.slice(0, 7)].filter(Boolean);
  return `${b.version} (${bits.length ? bits.join(', ') : 'dev'})`;
}

/** Major.minor: a server and app that differ here may not understand each other. */
export function sameRelease(a: string, b: string) {
  const mm = (v: string) => v.split('.').slice(0, 2).join('.');
  return mm(a) === mm(b);
}
