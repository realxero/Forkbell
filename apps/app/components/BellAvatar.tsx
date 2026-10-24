import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { color } from '../lib/theme';

export type BellMood = 'happy' | 'thinking' | 'listening';

/**
 * Bell's face: a little kettlebell with eyes, the same shape as the Forkbell
 * logo. `outline` is for the tab bar, where icons are line drawings.
 */
export function BellAvatar({ size = 32, tint = color.accent, face = color.onAccent, mood = 'happy', outline = false }: { size?: number; tint?: string; face?: string; mood?: BellMood; outline?: boolean }) {
  const eyeFill = outline ? tint : face;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Bell">
      {/* handle */}
      <Path d="M20 26 V18 a12 12 0 0 1 12 -12 h0 a12 12 0 0 1 12 12 V26" fill="none" stroke={tint} strokeWidth={outline ? 4 : 6} strokeLinecap="round" />
      {/* body */}
      <Circle cx={32} cy={39} r={outline ? 19 : 21} fill={outline ? 'none' : tint} stroke={tint} strokeWidth={outline ? 4 : 0} />
      {/* eyes: open, looking up while thinking */}
      <Ellipse cx={25} cy={mood === 'thinking' ? 34 : 37} rx={3} ry={mood === 'listening' ? 4.5 : 3.6} fill={eyeFill} />
      <Ellipse cx={39} cy={mood === 'thinking' ? 34 : 37} rx={3} ry={mood === 'listening' ? 4.5 : 3.6} fill={eyeFill} />
      {/* mouth */}
      {mood === 'thinking' ? (
        <Path d="M27 47 h10" stroke={eyeFill} strokeWidth={3} strokeLinecap="round" />
      ) : mood === 'listening' ? (
        <Ellipse cx={32} cy={47} rx={3.5} ry={3} fill={eyeFill} />
      ) : (
        <Path d="M25 45 q7 7 14 0" fill="none" stroke={eyeFill} strokeWidth={3} strokeLinecap="round" />
      )}
    </Svg>
  );
}
