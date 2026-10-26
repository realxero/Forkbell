// Every progress photo, newest day first, with your weight trend on each day.
// Tap one to see it big or delete it.
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { POSE_NAMES, photoDays, todayLocal, trendOnDate, type ProgressPhoto, type TrendPoint } from '@forkbell/shared';
import { photoSource, usePhotos } from '../../lib/photos';
import { cachedGet } from '../../lib/sync';
import { useUnit } from '../../lib/units';
import { PhotoViewer, niceDate } from '../../components/ProgressPhotos';
import { color, radius, space, type } from '../../lib/theme';

export default function Photos() {
  const units = useUnit();
  const { photos, error, remove } = usePhotos();
  const [weighIns, setWeighIns] = useState<TrendPoint[]>([]);
  const [open, setOpen] = useState<ProgressPhoto | null>(null);
  useFocusEffect(
    useCallback(() => {
      cachedGet<{ weighIns: TrendPoint[] }>(`/api/progress?today=${todayLocal()}`).then((p) => setWeighIns(p.weighIns), () => {});
    }, []),
  );
  const days = photoDays(photos ?? []);

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.head}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/progress'))} hitSlop={12} style={s.back} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={color.accent} />
          <Text style={s.backText}>Progress</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={[type.hero, { fontSize: 30 }]}>Progress photos</Text>
        <Text style={type.small}>Same spot, same light and the same time of day make them easiest to compare. Kept on your own server and in its nightly backup; only you can see them.</Text>
        {error && <Text style={{ color: color.over }}>{error}</Text>}
        {photos === null && !error && <ActivityIndicator color={color.iron} style={{ marginTop: space(6) }} />}
        {photos?.length === 0 && <Text style={type.body}>No photos yet. Add some from the Progress tab.</Text>}
        {days.map((d) => {
          const t = trendOnDate(weighIns, d.date);
          return (
            <View key={d.date} style={s.day}>
              <Text style={[type.body, { fontWeight: '800' }]}>
                {niceDate(d.date)}
                {t !== null && <Text style={[type.small, { fontWeight: '400' }]}>  ·  trend {units.label(t)}</Text>}
              </Text>
              <View style={s.row}>
                {d.photos.map((ph) => (
                  <Pressable key={ph.id} onPress={() => setOpen(ph)} style={s.slot} accessibilityLabel={`${POSE_NAMES[ph.pose]} photo, ${niceDate(ph.date)}`}>
                    <Image source={photoSource(ph.id)} style={s.thumb} resizeMode="cover" />
                    <Text style={type.small}>{POSE_NAMES[ph.pose]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <PhotoViewer photo={open} weighIns={weighIns} onClose={() => setOpen(null)} onDelete={async (ph) => { setOpen(null); await remove(ph.id); }} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { paddingHorizontal: space(3), paddingTop: space(2) },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: space(1) },
  backText: { color: color.accent, fontWeight: '700', fontSize: 16 },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  day: { backgroundColor: color.card, borderRadius: radius.card, padding: space(3), gap: space(2) },
  row: { flexDirection: 'row', gap: space(2) },
  slot: { width: '31%', gap: 4 },
  thumb: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.row, backgroundColor: color.raised },
});
