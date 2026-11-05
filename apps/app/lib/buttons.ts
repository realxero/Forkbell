// Forkbell's buttons: one filled look (iron, the gym colour, with chalk
// words) for the main action, a smaller one for actions inside a card, and
// a quiet outlined one for the second choice. One corner, one weight, and
// heights that stay at a comfortable 44 points or more for a thumb.
//
// Screens spread these into their own styles and add only layout (margins,
// alignSelf), e.g. button: { ...buttons.filled, marginTop: space(2) }.
import type { TextStyle, ViewStyle } from 'react-native';
import { color, radius, space } from './theme';

export const buttons = {
  /** The main action on a screen or sheet, usually full width. */
  filled: { backgroundColor: color.iron, borderRadius: radius.row, paddingVertical: space(3) + 2, paddingHorizontal: space(4), alignItems: 'center', justifyContent: 'center' },
  filledText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
  /** An action inside a card (Save, Use as my calorie goal). */
  small: { backgroundColor: color.iron, borderRadius: radius.row, paddingVertical: space(3), paddingHorizontal: space(4), alignItems: 'center', justifyContent: 'center' },
  smallText: { color: color.chalk, fontSize: 15, fontWeight: '700' },
  /** The second choice next to a filled button. */
  quiet: { backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: radius.row, paddingVertical: space(3) + 2, paddingHorizontal: space(4), alignItems: 'center', justifyContent: 'center' },
  quietText: { color: color.iron, fontSize: 16, fontWeight: '700' },
} satisfies Record<string, ViewStyle | TextStyle>;
