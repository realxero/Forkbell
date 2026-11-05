// Grey shapes in the layout of what's loading, shown instead of a spinner the
// first time a screen or list opens. They gently fade in and out together
// (one shared pulse, so every bar on the screen moves in step), and stay still
// when Reduce Motion is on. Spinners stay for actions you started (saving,
// searching, asking Bell), where "working on it" is the right message.
//
//   <FoodSkeleton />          the Food tab: summary, rings and three meals
//   <SkeletonCards count={3} />  cards with a heading and a few lines
//   <SkeletonRows rows={4} />    list rows: a round picture and two lines
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../lib/motion';
import { color, radius, space } from '../lib/theme';

// One pulse for every skeleton on screen, running only while one is showing.
const pulse = new Animated.Value(1);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;
const useNative = Platform.OS !== 'web';

function usePulse(still: boolean) {
  const counted = useRef(false);
  useEffect(() => {
    if (still) {
      pulse.setValue(0.75);
      return;
    }
    users += 1;
    counted.current = true;
    if (!loop) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.45, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: useNative }),
          Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: useNative }),
        ]),
      );
      loop.start();
    }
    return () => {
      if (!counted.current) return;
      counted.current = false;
      users -= 1;
      if (users === 0 && loop) {
        loop.stop();
        loop = null;
        pulse.setValue(1);
      }
    };
  }, [still]);
}

/** One grey block. Sizes are numbers or percentages. */
export function Bone({ w = '100%', h = 12, r = 6, style }: { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: color.line }, style]} />;
}

/** The fading wrapper every skeleton sits in, read out once as "Loading". */
function Fade({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const still = useReduceMotion();
  usePulse(still);
  return (
    <Animated.View style={[{ opacity: still ? 0.75 : pulse }, style]} accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
      {children}
    </Animated.View>
  );
}

/** Cards with a heading and a few lines, in the app's card style. */
export function SkeletonCards({ count = 3, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const widths: DimensionValue[] = ['92%', '78%', '64%'];
  return (
    <Fade style={[{ gap: space(3) }, style]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={s.card}>
          <Bone w="45%" h={18} />
          {widths.slice(0, i === 0 ? 3 : 2).map((w, j) => <Bone key={j} w={w} />)}
        </View>
      ))}
    </Fade>
  );
}

/** List rows: a round picture and two lines, like foods and exercises. */
export function SkeletonRows({ rows = 4, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Fade style={[{ gap: space(4), paddingVertical: space(2) }, style]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={s.row}>
          <Bone w={38} h={38} r={19} />
          <View style={{ flex: 1, gap: space(2) }}>
            <Bone w={i % 2 ? '55%' : '70%'} h={14} />
            <Bone w="35%" h={10} />
          </View>
        </View>
      ))}
    </Fade>
  );
}

/** The Food tab while the day loads: the summary with its rings, then three meals. */
export function FoodSkeleton() {
  return (
    <Fade style={{ gap: space(4) }}>
      <View style={[s.card, { padding: space(5), gap: space(4) }]}>
        <View style={s.row}>
          <Bone w={148} h={148} r={74} />
          <View style={{ flex: 1, gap: space(4), marginLeft: space(2) }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ gap: space(1) }}>
                <Bone w="40%" h={10} />
                <Bone w="60%" h={16} />
              </View>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[0, 1, 2].map((i) => <Bone key={i} w={72} h={72} r={36} />)}
        </View>
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={s.card}>
          <View style={s.row}>
            <Bone w={32} h={32} r={16} />
            <Bone w="35%" h={18} style={{ flex: 0 }} />
          </View>
          {i === 0 && <Bone w="80%" />}
        </View>
      ))}
    </Fade>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), borderWidth: 1, borderColor: color.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
});
