import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../../components/Tap';
import { router, useFocusEffect, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { BUILD, sameRelease, versionLabel, type SignInMethods } from '@forkbell/shared';
import { useAuth } from '../../../lib/auth';
import { api } from '../../../lib/api';
import { unreachable } from '../../../lib/problem';
import { flush, useSync, waitingNow } from '../../../lib/sync';
import { confirm } from '../../../lib/confirm';
import { buttons } from '../../../lib/buttons';
import { Logo } from '../../../components/Logo';
import { getHealthSettings, healthName, healthSupported } from '../../../lib/health-sync';
import { pictureCacheSupported, remindersSupported } from '../../../components/SettingsSections';
import { ACCENTS, color, nativeChoice, nativeThemeSupported, radius, savedNativeAccent, space, type, textSize } from '../../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Row = { icon: IconName; tint: string; title: string; detail?: string; href: Href };

const THEME_NAMES = { system: 'Matches the phone', light: 'Light', dark: 'Dark' } as const;

/** Settings: grouped rows, each opening its own page. */
export default function Settings() {
  const { me, signOut } = useAuth();
  const sync = useSync();
  const [bell, setBell] = useState<string | null>(null);
  // null: not asked yet; 'old': a server from before version markers (0.11); 'unreachable': no answer at all.
  const [server, setServer] = useState<SignInMethods['server'] | 'old' | 'unreachable' | null>(null);
  const [syncing, setSyncing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      api<{ enabled: boolean; model: string | null }>('/api/bell/status').then((b) => setBell(b.enabled ? `On${b.model ? ` · ${b.model}` : ''}` : 'Off'), () => setBell(null));
      // No answer is not the same as an old server: only say "update it" when the server answered.
      api<SignInMethods>('/auth/methods').then((m) => setServer(m?.server ?? 'old'), (e) => setServer(unreachable(e) ? 'unreachable' : 'old'));
    }, []),
  );
  const known = server && server !== 'old' && server !== 'unreachable' ? server : null;
  const mismatch = known && !sameRelease(known.version, BUILD.version);
  const g = me?.goals;
  const goals = g?.kcal ? `${g.kcal.toLocaleString()} kcal${g.protein ? ` · ${g.protein} g protein` : ''}` : 'Not set';
  const unit = me?.weightUnit === 'kg' ? 'Kilograms' : 'Pounds';
  const accent = savedNativeAccent();
  const appearance = nativeThemeSupported ? `${unit} · ${THEME_NAMES[nativeChoice]} · ${ACCENTS[accent ?? 'blue'].label}` : `${unit} · theme · accent colour`;
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'You',
      rows: [
        { icon: 'flag-outline', tint: color.tileCopper, title: 'Goals and targets', detail: goals, href: '/setting/goals' },
        { icon: 'restaurant-outline', tint: color.tileMagenta, title: 'Food preferences and suggestions', detail: 'Allergies, diet, food suggestions', href: '/preferences' },
        { icon: 'barbell-outline', tint: color.tileSlate, title: 'Training setup', detail: me?.preferences.training?.equipment?.length ? `Equipment: ${me.preferences.training.equipment.join(', ')}` : 'Equipment you have (full gym), areas to protect', href: { pathname: '/preferences', params: { section: 'training' } } },
        { icon: 'color-palette-outline', tint: color.tilePurple, title: 'Units and appearance', detail: appearance, href: '/setting/appearance' },
        { icon: 'lock-closed-outline', tint: color.tileGrey, title: 'Sign-in and security', detail: 'Password, where you’re signed in', href: '/setting/security' },
      ],
    },
    {
      title: 'Connections',
      rows: [
        // Bell wears your accent, the same as everywhere else.
        { icon: 'chatbubble-ellipses-outline', tint: color.accent, title: 'Bell (AI)', detail: bell ?? 'Checking…', href: '/setting/bell' },
        { icon: 'heart-outline', tint: color.tileMagenta, title: healthName ?? 'Apple Health and Health Connect', detail: healthSupported ? (getHealthSettings().connected ? 'Connected' : 'Not connected') : 'In the phone app', href: '/setting/health' },
        { icon: 'people-outline', tint: color.tileTeal, title: 'Sharing with family', detail: 'Who can see your data', href: '/sharing' },
        { icon: 'mic-outline', tint: color.tilePurple, title: 'Siri and Shortcuts', detail: 'Ask Bell and log food hands-free', href: '/setting/shortcuts' },
        { icon: 'sparkles-outline', tint: color.tileCopper, title: 'AI apps (Claude Desktop)', detail: 'Let an AI app read your data, and log if you allow', href: '/setting/aiapps' },
      ],
    },
    {
      title: 'Your data',
      rows: [{ icon: 'download-outline', tint: color.tileGrey, title: 'Export, import and backup', detail: 'Export everything; import workouts from Strong, Hevy or FitNotes', href: '/setting/data' }],
    },
    ...(remindersSupported || pictureCacheSupported
      ? [{ title: 'This phone', rows: [{ icon: 'notifications-outline' as IconName, tint: color.tileTeal, title: 'Reminders and offline pictures', detail: 'Notifications, saved exercise pictures', href: '/setting/phone' as Href }] }]
      : []),
  ];

  const syncNow = async () => {
    setSyncing(true);
    await flush().catch(() => {});
    setSyncing(false);
  };

  /**
   * Sign out, but never lose changes by surprise: anything still waiting gets
   * one more try to go up, and if it can't, you choose whether to discard it.
   */
  const onSignOut = async () => {
    await flush().catch(() => {});
    const { count: waiting, labels } = waitingNow();
    if (waiting > 0) {
      const names = labels.slice(0, 3).join(', ') + (labels.length > 3 ? '…' : '');
      const ok = await confirm(
        `${waiting} ${waiting === 1 ? 'change hasn’t' : 'changes haven’t'} synced yet`,
        `${names}. Signing out now discards ${waiting === 1 ? 'it' : 'them'}. With a connection, they go up by themselves.`,
        'Sign out and discard',
      );
      if (!ok) return;
    }
    await signOut();
  };

  const serverLine =
    server === null ? '…' : server === 'unreachable' ? 'can’t reach it right now' : server === 'old' ? 'older than 0.11 (update it)' : versionLabel(server);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={type.pageTitle}>Settings</Text>
        <Pressable
          onPress={() => router.push('/setting/security')}
          style={({ pressed }) => [s.account, pressed && { backgroundColor: color.raised }]}
          accessibilityLabel={`${me?.name ?? 'You'}${me?.email ? `, ${me.email}` : ''}`}
          accessibilityHint="Opens sign-in and security"
        >
          <View style={s.avatar} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text style={s.avatarText}>{(me?.name ?? me?.email ?? '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '800' }]} numberOfLines={1}>{me?.name ?? 'You'}</Text>
            {me?.email && <Text style={type.small} numberOfLines={1}>{me.email}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={color.ironSoft} />
        </Pressable>

        {sync.pending > 0 && (
          <View style={s.waiting} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-upload-outline" size={22} color={color.iron} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { fontWeight: '700' }]}>
                {sync.pending} {sync.pending === 1 ? 'change' : 'changes'} waiting to sync
              </Text>
              <Text style={type.small} numberOfLines={2}>{sync.labels.join(', ')}</Text>
            </View>
            <Pressable onPress={syncNow} disabled={syncing || sync.syncing} style={[s.retry, (syncing || sync.syncing) && { opacity: 0.5 }]} accessibilityState={{ busy: syncing || sync.syncing }}>
              <Text style={buttons.smallText}>{syncing || sync.syncing ? 'Syncing…' : 'Sync now'}</Text>
            </Pressable>
          </View>
        )}

        {groups.map((grp) => (
          <View key={grp.title} style={{ gap: space(2) }}>
            <Text style={s.groupTitle} accessibilityRole="header">{grp.title}</Text>
            <View style={s.group}>
              {grp.rows.map((r, i) => (
                <Pressable key={r.title} onPress={() => router.push(r.href)} style={({ pressed }) => [s.row, i > 0 && s.rowLine, pressed && { backgroundColor: color.raised }]} accessibilityRole="button">
                  <View style={[s.icon, { backgroundColor: r.tint }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <Ionicons name={r.icon} size={18} color={color.onAccent} />
                  </View>
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
          <Pressable onPress={onSignOut} style={({ pressed }) => [s.row, pressed && { backgroundColor: color.raised }]} accessibilityRole="button">
            <View style={[s.icon, { backgroundColor: color.over }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Ionicons name="log-out-outline" size={18} color={color.onAccent} />
            </View>
            <Text style={[type.body, { color: color.over, fontWeight: '700' }]}>Sign out</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', gap: space(1), marginTop: space(4) }}>
          <Logo size={40} />
          <Text style={[type.body, { fontWeight: '800' }]}>Forkbell</Text>
          <Text style={type.small}>Food and training, on your own server.</Text>
          <View style={s.versions}>
            <Text style={type.small} selectable>App {versionLabel(BUILD)}</Text>
            <Text style={type.small} selectable>Server {serverLine}</Text>
            {mismatch && (
              <Text style={[type.small, { color: color.over, textAlign: 'center' }]}>
                The app and the server are different versions. Update {versionNewer(known.version, BUILD.version) ? 'the app' : 'the server'} so they match.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Whether version a is newer than b (major.minor.patch). */
function versionNewer(a: string, b: string) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

const s = StyleSheet.create({
  versions: { alignItems: 'center', gap: 2, marginTop: space(2), paddingHorizontal: space(4) },
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(5), maxWidth: 640, width: '100%', alignSelf: 'center' },
  account: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.card, padding: space(4) },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: color.onAccent, fontWeight: '800', fontSize: textSize.heading },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.card, padding: space(4) },
  retry: { ...buttons.small, minHeight: 44 },
  groupTitle: { ...type.label, marginLeft: space(1) },
  group: { backgroundColor: color.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3), minHeight: 56 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.line },
  // Tiles sit inside a row, so they take the inner-item corner.
  icon: { width: 30, height: 30, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
});
