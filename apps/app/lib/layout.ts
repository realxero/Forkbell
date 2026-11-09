// Screen width for layout. Wide (a desktop browser, an iPad in landscape)
// gets the sidebar instead of the tab bar, and pages that have more to show
// use the room. Phones never cross it.
import { useWindowDimensions } from 'react-native';

export const WIDE = 1024;
export const useWide = () => useWindowDimensions().width >= WIDE;
