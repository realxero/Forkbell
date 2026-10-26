// Progress photos on the Progress tab: today's front, side and back (camera or
// photo library), and your first and latest photo of a pose side by side, with
// your weight trend on each day. Only ever shown to you.
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { POSES, POSE_NAMES, firstAndLatest, todayLocal, trendOnDate, type Pose, type ProgressPhoto, type TrendPoint } from '@forkbell/shared';
import { photoSource, usePhotos } from '../lib/photos';
import { useUnit } from '../lib/units';
import { confirm } from '../lib/confirm';
import { Chip } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

export const niceDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
const canUseCamera = Platform.OS !== 'web';

export function ProgressPhotosCard({ weighIns }: { weighIns: TrendPoint[] }) {
  const units = useUnit();
  const { photos, error, busy, add, remove } = usePhotos();
  const [pose, setPose] = useState<Pose>('front');
  const [open, setOpen] = useState<ProgressPhoto | null>(null);
  const today = todayLocal();
  const { first, latest } = firstAndLatest(photos ?? [], pose);
  const trend = (d: string) => trendOnDate(weighIns, d);
  const change = first && latest ? (() => {
    const a = trend(first.date);
    const b = trend(latest.date);
    return a !== null && b !== null ? b - a : null;
  })() : null;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={[type.title, { flex: 1 }]}>Progress photos</Text>
        {Boolean(photos?.length) && (
          <Pressable onPress={() => router.push('/photos')} hitSlop={8}><Text style={s.link}>See all ›</Text></Pressable>
        )}
      </View>
      <Text style={type.small}>Only you can see these, even with family sharing on.</Text>
      {error && <Text style={[type.small, { color: color.over }]}>{error}</Text>}
      {photos === null && !error && <ActivityIndicator color={color.iron} />}

      {photos !== null && (
        <>
          <Text style={s.section}>Today</Text>
          <View style={s.row}>
            {POSES.map((p) => {
              const have = [...photos].reverse().find((x) => x.date === today && x.pose === p);
              return (
                <View key={p} style={s.slot}>
                  <Pressable
                    onPress={() => (have ? setOpen(have) : void add(p, canUseCamera, today))}
                    style={[s.tile, !have && s.empty]}
                    accessibilityRole="button"
                    accessibilityLabel={have ? `Today's ${POSE_NAMES[p].toLowerCase()} photo` : `Take a ${POSE_NAMES[p].toLowerCase()} photo`}
                  >
                    {busy === p ? (
                      <ActivityIndicator color={color.iron} />
                    ) : have ? (
                      <Image source={photoSource(have.id)} style={s.fill} resizeMode="cover" />
                    ) : (
                      <Ionicons name={canUseCamera ? 'camera-outline' : 'image-outline'} size={26} color={color.ironSoft} />
                    )}
                  </Pressable>
                  <View style={s.slotFoot}>
                    <Text style={[type.small, { fontWeight: '700' }]}>{POSE_NAMES[p]}</Text>
                    {canUseCamera && (
                      <Pressable onPress={() => void add(p, false, today)} hitSlop={8} accessibilityLabel={`Choose a ${POSE_NAMES[p].toLowerCase()} photo from your library`}>
                        <Ionicons name="images-outline" size={18} color={color.accent} />
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {photos.length > 0 && (
            <>
              <Text style={s.section}>First and latest</Text>
              <View style={s.chips}>
                {POSES.map((p) => <Chip key={p} label={POSE_NAMES[p]} on={pose === p} onPress={() => setPose(p)} />)}
              </View>
              {!first ? (
                <Text style={type.small}>No {POSE_NAMES[pose].toLowerCase()} photos yet.</Text>
              ) : (
                <View style={s.row}>
                  {[first, latest].map((ph, i) =>
                    ph ? (
                      <Pressable key={ph.id} style={{ flex: 1, gap: space(1) }} onPress={() => setOpen(ph)} accessibilityLabel={`${i ? 'Latest' : 'First'} ${POSE_NAMES[pose].toLowerCase()} photo, ${niceDate(ph.date)}`}>
                        <Image source={photoSource(ph.id)} style={s.compare} resizeMode="cover" />
                        <Text style={[type.small, { fontWeight: '700' }]}>{i ? 'Latest' : 'First'} · {niceDate(ph.date)}</Text>
                        <Text style={type.small}>{trend(ph.date) !== null ? `Trend ${units.label(trend(ph.date))}` : 'No weigh-in near then'}</Text>
                      </Pressable>
                    ) : (
                      <View key="none" style={[s.compare, s.empty, { flex: 1, padding: space(3) }]}>
                        <Text style={[type.small, { textAlign: 'center' }]}>Add another {POSE_NAMES[pose].toLowerCase()} photo on a later day to compare.</Text>
                      </View>
                    ),
                  )}
                </View>
              )}
              {change !== null && (
                <Text style={[type.body, { fontWeight: '700' }]}>
                  {Math.abs(change) < 0.05 ? 'Same trend weight' : `${change < 0 ? '−' : '+'}${units.label(Math.abs(change))} on the trend`} in between.
                </Text>
              )}
            </>
          )}
        </>
      )}
      <PhotoViewer photo={open} weighIns={weighIns} onClose={() => setOpen(null)} onDelete={async (ph) => { setOpen(null); await remove(ph.id); }} />
    </View>
  );
}

/** One photo, big, with its day and trend, and Delete. */
export function PhotoViewer({ photo, weighIns, onClose, onDelete }: { photo: ProgressPhoto | null; weighIns: TrendPoint[]; onClose: () => void; onDelete: (p: ProgressPhoto) => void }) {
  const units = useUnit();
  const t = photo ? trendOnDate(weighIns, photo.date) : null;
  return (
    <Modal visible={photo !== null} animationType="fade" onRequestClose={onClose} transparent>
      <View style={s.viewer}>
        {photo && <Image source={photoSource(photo.id)} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel={`${POSE_NAMES[photo.pose]} photo, ${niceDate(photo.date)}`} />}
        <View style={s.viewerBar}>
          <View style={{ flex: 1 }}>
            {photo && <Text style={s.viewerText}>{POSE_NAMES[photo.pose]} · {niceDate(photo.date)}</Text>}
            {photo && t !== null && <Text style={[s.viewerText, { fontWeight: '400' }]}>Trend {units.label(t)}</Text>}
          </View>
          <Pressable
            onPress={async () => photo && (await confirm('Delete this photo?', 'It’s removed from your server. This can’t be undone.', 'Delete')) && onDelete(photo)}
            hitSlop={10}
            accessibilityLabel="Delete this photo"
          >
            <Ionicons name="trash-outline" size={24} color="#FF6B61" />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={28} color="#fff" /></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(2) },
  head: { flexDirection: 'row', alignItems: 'center' },
  link: { color: color.accent, fontWeight: '700' },
  section: { ...type.label, marginTop: space(2) },
  row: { flexDirection: 'row', gap: space(2) },
  chips: { flexDirection: 'row', gap: space(2) },
  slot: { flex: 1, gap: space(1) },
  tile: { aspectRatio: 3 / 4, borderRadius: radius.row, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.line, backgroundColor: color.chalk, alignItems: 'center', justifyContent: 'center', borderRadius: radius.row },
  fill: { width: '100%', height: '100%' },
  slotFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 },
  compare: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.row, backgroundColor: color.raised },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerBar: { flexDirection: 'row', alignItems: 'center', gap: space(5), padding: space(4), paddingBottom: space(10), backgroundColor: 'rgba(0,0,0,0.6)' },
  viewerText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
