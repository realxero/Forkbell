import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Tap';
import { dismissToast, useToast } from '../lib/toast';
import { color, space, textSize } from '../lib/theme';

/** Shows the current toast above the tab bar. */
export function ToastHost() {
  const t = useToast();
  // VoiceOver doesn't follow live regions (Android only): say it.
  useEffect(() => {
    if (t?.text) AccessibilityInfo.announceForAccessibility(t.action ? `${t.text}. ${t.action.label} is available.` : t.text);
  }, [t?.text, t?.action]);
  if (!t) return null;
  return (
    <View pointerEvents="box-none" style={s.wrap}>
      <View style={[s.toast, t.tone === 'celebrate' && { backgroundColor: color.fatText }]} accessibilityLiveRegion="polite">
        <Text style={s.text}>{t.text}</Text>
        {t.action && (
          <Pressable
            onPress={async () => {
              dismissToast();
              await t.action!.run();
            }}
            hitSlop={10}
            style={{ minHeight: 44, justifyContent: 'center' }}
            accessibilityLabel={t.action.label}
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
  text: { color: color.chalk, fontSize: textSize.control, fontWeight: '600', flexShrink: 1 },
  action: { color: color.chalk, fontSize: textSize.control, fontWeight: '800', textDecorationLine: 'underline' },
});
