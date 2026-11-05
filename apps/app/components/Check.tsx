// The app's tick. When something is ticked (a set, a dose, a shopping item,
// a food to keep), the tick draws itself in with one quick stroke instead of
// just appearing. It only draws when it changes to ticked while you watch:
// a screen that opens with sets already done shows them done, still. With
// Reduce Motion on, it appears without drawing.
//
// <Check on={done} tint={color.card} />            nothing shows until ticked
// <Check on={done} tint={color.card} offTint={…} /> a faint tick shows before
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useReduceMotion } from '../lib/motion';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const D = 'M4.5 12.5 9.5 17.5 19.5 7';
/** The tick's length in the 24-unit drawing, a little over its 21.6. */
const LENGTH = 22;

type Props = {
  on: boolean;
  /** The tick's colour once ticked. */
  tint: string;
  /** If given, an unticked tick shows in this colour. */
  offTint?: string;
  size?: number;
};

export function Check({ on, tint, offTint, size = 20 }: Props) {
  const still = useReduceMotion();
  const offset = useRef(new Animated.Value(0)).current;
  const [drawing, setDrawing] = useState(false);
  const was = useRef(on);

  useEffect(() => {
    const turnedOn = on && !was.current;
    was.current = on;
    if (!turnedOn || still) {
      setDrawing(false);
      return;
    }
    offset.setValue(LENGTH);
    setDrawing(true);
    const a = Animated.timing(offset, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    // Whatever happens to the animation, the tick ends up drawn.
    a.start(() => setDrawing(false));
    return () => a.stop();
  }, [on, still, offset]);

  if (!on && !offTint) return null;
  const stroke = on ? tint : offTint!;
  const common = { d: D, stroke, strokeWidth: 2.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {drawing ? <AnimatedPath {...common} strokeDasharray={LENGTH} strokeDashoffset={offset} /> : <Path {...common} />}
    </Svg>
  );
}
