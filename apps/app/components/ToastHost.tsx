import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dismissToast, useToast } from '../lib/toast';
import { color, space } from '../lib/theme';

/** Shows the current toast above the tab bar. */
export function ToastHost() {
  const t = useToast();
  if (!t) return null;
  return (
    <View pointerEvents="box-none" style={s.wrap}>
      <View style={[s.toast, t.tone === 'celebrate' && { backgroundColor: color.fat }]} accessibilityLiveRegion="polite">
        <Text style={s.text}>{t.text}</Text>
        {t.action && (
          <Pressable
            onPress={async () => {
              dismissToast();
              await t.action!.run();
            }}
            hitSlop={10}
          >
            <Text style={s.action}>{t.action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 150, alignItems: 'center', paddingHorizontal: space(4) },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space(4), backgroundColor: color.iron, borderRadius: 14, paddingVertical: space(3), paddingHorizontal: space(4), maxWidth: 560, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  text: { color: color.chalk, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  action: { color: color.chalk, fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
});
