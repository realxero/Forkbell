import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { BellMood } from '@forkbell/shared';
import { useReduceMotion } from '../lib/motion';
import { color } from '../lib/theme';

export type { BellMood };

/**
 * Bell's face: a little kettlebell with eyes, the same shape as the Forkbell
 * logo. `outline` is for the tab bar, where icons are line drawings.
 *
 * With `alive`, Bell blinks now and then, bobs gently, and while thinking
 * glances around. All of it stops with Reduce Motion. Moods:
 *   happy      a smile
 *   thinking   "hmm": a sideways mouth, eyes looking about
 *   listening  wide eyes, an open "o"
 *   curious    one brow up, head tilted, asking you something
 *   excited    ^ ^ eyes, a big grin and a sparkle (food added)
 *   proud      happy closed eyes, a grin and rosy cheeks (records, goals)
 *   concerned  worried brows and a small frown (you mentioned pain)
 */
export function BellAvatar({
  size = 32,
  tint = color.accent,
  face = color.onAccent,
  mood = 'happy',
  outline = false,
  alive = false,
}: {
  size?: number;
  tint?: string;
  face?: string;
  mood?: BellMood;
  outline?: boolean;
  alive?: boolean;
}) {
  const still = useReduceMotion() || outline || !alive;
  const ink = outline ? tint : face;
  const [blink, setBlink] = useState(false);
  const [glance, setGlance] = useState(0);
  const bob = useRef(new Animated.Value(0)).current;

  // Blink every few seconds, at a slightly random pace so it doesn't look mechanical.
  useEffect(() => {
    if (still) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        setBlink(true);
        t = setTimeout(() => {
          setBlink(false);
          next();
        }, 130);
      }, 2600 + Math.random() * 2600);
    };
    next();
    return () => clearTimeout(t);
  }, [still]);

  // Thinking: eyes drift left, up, right while Bell works it out.
  useEffect(() => {
    if (still || mood !== 'thinking') return setGlance(0);
    const steps = [-2.5, 0, 2.5, 0];
    let i = 0;
    const id = setInterval(() => setGlance(steps[i++ % steps.length]!), 650);
    return () => clearInterval(id);
  }, [still, mood]);

  useEffect(() => {
    if (still) return bob.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: mood === 'excited' ? 380 : 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: mood === 'excited' ? 380 : 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, mood, bob]);

  const lift = size * (mood === 'excited' ? 0.07 : 0.035);
  const tilt = mood === 'curious' ? '-8deg' : mood === 'concerned' ? '4deg' : '0deg';
  const eyeY = mood === 'thinking' ? 34 : mood === 'concerned' ? 38 : 37;
  const eyeR = mood === 'listening' || mood === 'curious' ? 4.4 : 3.6;
  const ry = blink ? 0.6 : eyeR;
  const shine = !outline && !blink && !['excited', 'proud'].includes(mood);

  const eyes = () => {
    if (mood === 'excited' || mood === 'proud') {
      // ^ ^ for excited, gently closed arcs for proud
      const arc = mood === 'excited' ? (x: number) => `M${x - 4} 39 l4 -5 l4 5` : (x: number) => `M${x - 4} 37 q4 -4.5 8 0`;
      return [25, 39].map((x) => <Path key={x} d={arc(x)} fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />);
    }
    return [25, 39].map((x) => (
      <G key={x}>
        <Ellipse cx={x + glance} cy={eyeY} rx={3} ry={ry} fill={ink} />
        {shine && <Circle cx={x + glance + 1.1} cy={eyeY - 1.4} r={1} fill={tint} />}
      </G>
    ));
  };

  const mouth = () => {
    switch (mood) {
      case 'thinking': // hmm
        return <Path d="M27 47.5 q3 -2 5 0 t5 0" fill="none" stroke={ink} strokeWidth={2.6} strokeLinecap="round" transform={`translate(${glance * 0.6} 0)`} />;
      case 'listening':
        return <Ellipse cx={32} cy={47} rx={3.5} ry={3} fill={ink} />;
      case 'curious':
        return <Ellipse cx={33} cy={47.5} rx={2.2} ry={2.4} fill={ink} />;
      case 'excited':
        return <Path d="M24 44 q8 10 16 0 z" fill={ink} stroke={ink} strokeWidth={2} strokeLinejoin="round" />;
      case 'proud':
        return <Path d="M25 45 q7 7.5 14 0" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" />;
      case 'concerned':
        return <Path d="M27 49 q5 -4 10 0" fill="none" stroke={ink} strokeWidth={2.8} strokeLinecap="round" />;
      default:
        return <Path d="M25 45 q7 7 14 0" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" />;
    }
  };

  const brows = () => {
    if (mood === 'curious') return <Path d="M35 29 q4 -3 8 -1" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />;
    if (mood === 'concerned')
      return (
        <>
          <Path d="M21 32 l7 -2.5" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
          <Path d="M43 32 l-7 -2.5" fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
        </>
      );
    return null;
  };

  const svg = (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel={`Bell${mood === 'happy' ? '' : `, ${mood}`}`}>
      {/* handle */}
      <Path d="M20 26 V18 a12 12 0 0 1 12 -12 h0 a12 12 0 0 1 12 12 V26" fill="none" stroke={tint} strokeWidth={outline ? 4 : 6} strokeLinecap="round" />
      {/* body */}
      <Circle cx={32} cy={39} r={outline ? 19 : 21} fill={outline ? 'none' : tint} stroke={tint} strokeWidth={outline ? 4 : 0} />
      {mood === 'proud' && !outline && (
        <>
          <Circle cx={19} cy={44} r={3} fill="#FF8A8A" opacity={0.55} />
          <Circle cx={45} cy={44} r={3} fill="#FF8A8A" opacity={0.55} />
        </>
      )}
      {brows()}
      {eyes()}
      {mouth()}
      {mood === 'excited' && <Path d="M54 10 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 z" fill="#FFC53D" />}
    </Svg>
  );

  if (outline || (!alive && mood !== 'curious' && mood !== 'concerned')) return svg;
  return (
    <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -lift] }) }, { rotate: tilt }] }}>{svg}</Animated.View>
  );
}
