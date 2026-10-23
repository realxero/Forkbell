import Svg, { Path } from 'react-native-svg';
import { color } from '../lib/theme';

// The Forkbell mark (a kettlebell whose handle is a rising fork), from
// assets/forkbell-mark.svg. Drawn in your accent colour.
const D =
  'M330 418.6 V320 A150 150 0 0 1 480 170 H544 A150 150 0 0 1 694 320 V418.6 A250 250 0 0 1 621 815 H403 A250 250 0 0 1 330 418.6 Z M398 367.5 V318 A80 80 0 0 1 478 238 H546 A80 80 0 0 1 626 318 V367.5 A250 250 0 0 0 398 367.5 Z M425 481 A15 15 0 0 1 455 481 V543 A9 9 0 0 0 473 543 V461 A15 15 0 0 1 503 461 V543 A9 9 0 0 0 521 543 V441 A15 15 0 0 1 551 441 V543 A9 9 0 0 0 569 543 V421 A15 15 0 0 1 599 421 V575 C599 628 534 632 534 670 V730 A22 22 0 0 1 490 730 V670 C490 632 425 628 425 575 Z';

export function Logo({ size = 40, tint = color.accent }: { size?: number; tint?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Forkbell">
      <Path fill={tint} fillRule="evenodd" transform="translate(512 512) scale(1.1) translate(-512 -492.5)" d={D} />
    </Svg>
  );
}
