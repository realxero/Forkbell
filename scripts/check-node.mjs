// Stops a Docker build (or anything else that runs it) on a Node.js with a
// known security hole, instead of shipping it quietly. Docker reuses the Node
// image it already has unless you build with --pull, so an old one can linger.
// Raise MIN when a new Node security release comes out.
const MIN = { 24: '24.22.1', 26: '26.12.1' }; // CVE-2026-111497 (Brotli, "Node2Shell")
const [major, minor, patch] = process.versions.node.split('.').map(Number);
const need = MIN[major];
const older = (want) => {
  const [a, b, c] = want.split('.').map(Number);
  return minor < b || (minor === b && patch < c) || major < a;
};
if (!need) {
  console.error(`Node ${process.versions.node} isn't a Node version Forkbell is built for (24 or 26).`);
  process.exit(1);
}
if (older(need)) {
  console.error(`Node ${process.versions.node} has a known security hole; ${need} or newer fixes it.`);
  console.error('Docker reused an old copy of the Node image. Build again with --pull:');
  console.error('  sudo docker build --pull -t forkbell:latest .');
  process.exit(1);
}
console.log(`Node ${process.versions.node}: OK`);
