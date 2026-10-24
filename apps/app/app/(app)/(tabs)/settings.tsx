import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useAuth } from '../../../lib/auth';
import { api } from '../../../lib/api';
import { Logo } from '../../../components/Logo';
import { getHealthSettings, healthName, healthSupported } from '../../../lib/health-sync';
import { pictureCacheSupported, remindersSupported } from '../../../components/SettingsSections';
import { color, radius, space, type } from '../../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Row = { icon: IconName; tint: string; title: string; detail?: string; href: Href };

/** Settings: grouped rows, each opening its own page. */
export default function Settings() {
  const { me, signOut } = useAuth();
  const [bell, setBell] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api<{ enabled: boolean; model: string | null }>('/api/bell/status').then((b) => setBell(b.enabled ? (b.model ?? 'On') : 'Off'), () => setBell(null));
    }, []),
  );
  const g = me?.goals;
  const goals = g?.kcal ? `${g.kcal.toLocaleString()} kcal${g.protein ? ` · ${g.protein} g protein` : ''}` : 'Not set';
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'You',
      rows: [
        { icon: 'flag-outline', tint: '#2E9E62', title: 'Goals and targets', detail: goals, href: '/setting/goals' },
        { icon: 'restaurant-outline', tint: '#E8590C', title: 'Food preferences and suggestions', detail: 'Allergies, diet, suggestions, patterns', href: '/preferences' },
        { icon: 'barbell-outline', tint: '#1C252B', title: 'Training setup', detail: me?.preferences.training?.equipment?.length ? `Equipment: ${me.preferences.training.equipment.join(', ')}` : 'Equipment you have (full gym), areas to protect', href: '/preferences' },
        { icon: 'color-palette-outline', tint: '#6A4BD1', title: 'Units and appearance', detail: `${me?.weightUnit === 'kg' ? 'Kilograms' : 'Pounds'} · theme · accent colour`, href: '/setting/appearance' },
      ],
    },
    {
      title: 'Connections',
      rows: [
        { icon: 'chatbubble-ellipses-outline', tint: '#2B6BD6', title: 'Bell (AI)', detail: bell ?? '', href: '/setting/bell' },
        { icon: 'heart-outline', tint: '#D2423A', title: healthName ?? 'Apple Health and Health Connect', detail: healthSupported ? (getHealthSettings().connected ? 'Connected' : 'Not connected') : 'In the phone app', href: '/setting/health' },
        { icon: 'people-outline', tint: '#0F8B8D', title: 'Sharing with family', detail: 'Who can see your data', href: '/sharing' },
        { icon: 'mic-outline', tint: '#C2185B', title: 'Siri and Shortcuts', detail: 'Ask Bell and log food hands-free', href: '/setting/shortcuts' },
      ],
    },
    {
      title: 'Your data',
      rows: [{ icon: 'download-outline', tint: '#5B6B73', title: 'Export and backup', detail: 'Everything as JSON, diary and workouts as CSV', href: '/setting/data' }],
    },
    ...(remindersSupported || pictureCacheSupported
      ? [{ title: 'This phone', rows: [{ icon: 'notifications-outline' as IconName, tint: '#D99A00', title: 'Reminders and offline pictures', detail: 'Notifications, saved exercise pictures', href: '/setting/phone' as Href }] }]
      : []),
  ];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={[type.hero, { fontSize: 34 }]}>Settings</Text>
        <View style={s.account}>
          <View style={s.avatar}><Text style={s.avatarText}>{(me?.name ?? me?.email ?? '?').slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '800' }]} numberOfLines={1}>{me?.name ?? 'You'}</Text>
            {me?.email && <Text style={type.small} numberOfLines={1}>{me.email}</Text>}
          </View>
        </View>

        {groups.map((grp) => (
          <View key={grp.title} style={{ gap: space(2) }}>
            <Text style={s.groupTitle}>{grp.title}</Text>
            <View style={s.group}>
              {grp.rows.map((r, i) => (
                <Pressable key={r.title} onPress={() => router.push(r.href)} style={({ pressed }) => [s.row, i > 0 && s.rowLine, pressed && { backgroundColor: color.raised }]} accessibilityRole="button">
                  <View style={[s.icon, { backgroundColor: r.tint }]}><Ionicons name={r.icon} size={18} color="#fff" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{r.title}</Text>
                    {!!r.detail && <Text style={type.small} numberOfLines={1}>{r.detail}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={color.ironSoft} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <View style={s.group}>
          <Pressable onPress={signOut} style={s.row} accessibilityRole="button">
            <View style={[s.icon, { backgroundColor: color.over }]}><Ionicons name="log-out-outline" size={18} color="#fff" /></View>
            <Text style={[type.body, { color: color.over, fontWeight: '700' }]}>Sign out</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', gap: space(1), marginTop: space(4) }}>
          <Logo size={40} />
          <Text style={[type.body, { fontWeight: '800' }]}>Forkbell</Text>
          <Text style={type.small}>Food and training, on your own server.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(5), maxWidth: 640, width: '100%', alignSelf: 'center' },
  account: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.card, padding: space(4), borderWidth: 1, borderColor: color.line },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: color.onAccent, fontWeight: '900', fontSize: 18 },
  groupTitle: { ...type.label, marginLeft: space(1) },
  group: { backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3), minHeight: 56 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.line },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
