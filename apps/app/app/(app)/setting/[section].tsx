import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AiSettings, AppearanceSection, GoalsSection, HealthSection, PhoneSection } from '../../../components/SettingsSections';
import { DataSection } from '../../../components/DataSection';
import { ShortcutsSection } from '../../../components/ShortcutsSection';
import { SecuritySection } from '../../../components/SecuritySection';
import { color, space, type } from '../../../lib/theme';

const SECTIONS = {
  goals: { title: 'Goals and targets', body: GoalsSection },
  appearance: { title: 'Units and appearance', body: AppearanceSection },
  bell: { title: 'Bell (AI)', body: AiSettings },
  health: { title: 'Apple Health and Health Connect', body: HealthSection },
  phone: { title: 'This phone', body: PhoneSection },
  data: { title: 'Export and backup', body: DataSection },
  shortcuts: { title: 'Siri and Shortcuts', body: ShortcutsSection },
  security: { title: 'Sign-in and security', body: SecuritySection },
} as const;

/** One group of settings, opened from the Settings tab. */
export default function SettingSection() {
  const { section } = useLocalSearchParams<{ section: keyof typeof SECTIONS }>();
  const def = SECTIONS[section as keyof typeof SECTIONS];
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} hitSlop={12} style={s.back} accessibilityLabel="Back to Settings">
          <Ionicons name="chevron-back" size={22} color={color.accent} />
          <Text style={s.backText}>Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={[type.hero, { fontSize: 30 }]}>{def?.title ?? 'Settings'}</Text>
        {def ? <def.body /> : <Text style={type.body}>That page doesn’t exist.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { paddingHorizontal: space(3), paddingTop: space(2) },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: space(1) },
  backText: { color: color.accent, fontWeight: '700', fontSize: 16 },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
});
