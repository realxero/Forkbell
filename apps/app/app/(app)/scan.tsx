// Measure a plate with LiDAR. The phone takes a photo and a depth map; Bell
// finds and names each food in the photo; the phone measures how much of each
// there is from the depth. Weigh the full plate too and the scale's exact
// total is split between the foods by their measured size. Bell then looks up
// the nutrition and shows the review card as usual, with these amounts.
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { gramsFromVolumes, MEALS, mealForTime, parseWeight, plateVolumes, todayLocal, type Meal } from '@forkbell/shared';
import { post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Chip, MEAL_NAMES } from '../../components/AmountPicker';
import { capturePlate, lidarSupported } from '../../modules/forkbell-depth';
import { color, radius, space, type } from '../../lib/theme';

type Found = { name: string; box: [number, number, number, number]; density: number; note: string | null };
type Item = Found & { ml: number; coverage: number; edited: string | null };
type Photo = { uri: string; width: number; height: number };
const COLORS = ['#2E9E62', '#E8590C', '#2B6BD6', '#C2185B', '#6A4BD1', '#0F8B8D', '#D99A00', '#5B6B73'];

export default function Scan() {
  const params = useLocalSearchParams<{ meal?: Meal; date?: string }>();
  const date = params.date ?? todayLocal();
  const meal: Meal = params.meal && (MEALS as readonly string[]).includes(params.meal) ? params.meal : mealForTime();
  const { me } = useAuth();
  const containers = me?.preferences.containers ?? [];
  const [stage, setStage] = useState<'start' | 'finding' | 'review'>('start');
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [container, setContainer] = useState<string | null>(null);
  const [tilt, setTilt] = useState(0);
  const [plateId, setPlateId] = useState<string | null>(null);
  const [reading, setReading] = useState('');

  const measure = async () => {
    setError(null);
    try {
      const cap = await capturePlate();
      if (!cap) return;
      setStage('finding');
      setPhoto({ uri: cap.image, width: cap.imageWidth, height: cap.imageHeight });
      const found = await post<{ container: string | null; items: Found[] }>('/api/bell/plate', { image: cap.image });
      if (!found.items.length) throw new Error('Bell didn’t see any food in that one. Try again with the whole plate in view.');
      const v = plateVolumes(cap, found.items);
      if (!v.ok) throw new Error(v.error);
      setItems(found.items.map((f, i) => ({ ...f, ml: v.volumes[i]!.ml, coverage: v.volumes[i]!.coverage, edited: null })));
      setContainer(found.container);
      setTilt(v.tableTilt);
      setStage('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('start');
    }
  };

  const plate = containers.find((c) => c.id === plateId) ?? null;
  const read = parseWeight(reading);
  const total = read !== null ? read - (plate?.grams ?? 0) : null;
  const measured = gramsFromVolumes(items, total && total > 0 ? total : null);
  const grams = items.map((it, i) => (it.edited !== null ? parseWeight(it.edited) : measured[i]!));
  const ready = items.length > 0 && grams.every((g) => g !== null && g > 0);

  const send = () => {
    const list = items.map((it, i) => `${it.name}: ${grams[i]} g${it.note ? ` (${it.note})` : ''}`).join('; ');
    const how = total && total > 0 ? 'measured with LiDAR and weighed on my kitchen scale' : 'measured with LiDAR';
    const when = date === todayLocal() ? '' : ` on ${date}`;
    router.replace({ pathname: '/bell', params: { ask: `Log these to ${MEAL_NAMES[meal].toLowerCase()}${when}, ${how}. Use these amounts as they are: ${list}.` } });
  };

  if (!lidarSupported)
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.content}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
          <Text style={[type.hero, { fontSize: 30 }]}>Measure with LiDAR</Text>
          <Text style={type.body}>This needs the Forkbell app on an iPhone or iPad Pro with LiDAR, in a build that includes the LiDAR camera. Weighing on a scale works everywhere.</Text>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
        <Text style={[type.hero, { fontSize: 30 }]}>Measure with LiDAR</Text>
        <Text style={type.small}>{MEAL_NAMES[meal]}{date === todayLocal() ? '' : ` · ${date}`}</Text>

        {stage === 'start' && (
          <>
            <Text style={type.body}>
              Put the plate on a clear table. Hold your phone straight above it, about 30–40 cm up, with some table showing all the way around, and tap the button. Bell names each food and the LiDAR measures how much of each there is.
            </Text>
            <Text style={type.small}>Works best on a flat plate. In a deep bowl the sensor can’t see the bottom, so weigh it instead.</Text>
            <Pressable onPress={measure} style={s.primary}>
              <Ionicons name="scan-outline" size={22} color={color.onAccent} />
              <Text style={s.primaryText}>Open the LiDAR camera</Text>
            </Pressable>
          </>
        )}
        {stage === 'finding' && (
          <View style={{ alignItems: 'center', gap: space(3), marginVertical: space(6) }}>
            <ActivityIndicator color={color.accent} />
            <Text style={type.body}>Bell is finding each food…</Text>
          </View>
        )}
        {error && <Text style={{ color: color.over }}>{error}</Text>}

        {stage !== 'start' && photo && <PlateView photo={photo} boxes={stage === 'review' ? items.map((i) => i.box) : []} />}

        {stage === 'review' && (
          <>
            {tilt > 20 && <Text style={[type.small, { color: color.warnText }]}>The phone was {tilt}° from straight above, so these may be off. Straighter is better.</Text>}
            {container === 'bowl' && <Text style={[type.small, { color: color.warnText }]}>That looks like a bowl. The sensor can’t see its bottom, so these are probably low: weigh it if you can.</Text>}
            {items.map((it, i) => (
              <View key={i} style={s.card}>
                <View style={s.row}>
                  <View style={[s.dot, { backgroundColor: COLORS[i % COLORS.length] }]}><Text style={s.dotText}>{i + 1}</Text></View>
                  <TextInput value={it.name} onChangeText={(v) => setItems((l) => l.map((x, j) => (j === i ? { ...x, name: v } : x)))} style={[s.input, { flex: 1, fontWeight: '700' }]} accessibilityLabel={`Food ${i + 1}`} />
                  <Pressable onPress={() => setItems((l) => l.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel={`Remove ${it.name}`}>
                    <Ionicons name="close-circle-outline" size={22} color={color.ironSoft} />
                  </Pressable>
                </View>
                <View style={s.row}>
                  <TextInput
                    value={it.edited ?? String(grams[i] ?? '')}
                    onChangeText={(v) => setItems((l) => l.map((x, j) => (j === i ? { ...x, edited: v } : x)))}
                    keyboardType="decimal-pad"
                    style={[s.input, s.grams]}
                    accessibilityLabel={`Grams of ${it.name}`}
                  />
                  <Text style={[type.small, { flex: 1 }]}>
                    g · about {it.ml} ml{it.coverage < 0.6 ? ' · partly measured' : ''}{it.note ? ` · ${it.note}` : ''}
                  </Text>
                </View>
              </View>
            ))}

            <View style={s.card}>
              <Text style={[type.body, { fontWeight: '700' }]}>Weighed it too? (most accurate)</Text>
              <Text style={type.small}>Put the plate on your scale and type what it shows. Forkbell splits that exact weight between the foods by their measured size.</Text>
              <View style={s.chips}>
                <Chip label="Tared plate" on={!plateId} onPress={() => setPlateId(null)} />
                {containers.map((c) => <Chip key={c.id} label={`${c.name} (${c.grams} g)`} on={plateId === c.id} onPress={() => setPlateId(c.id)} />)}
              </View>
              <TextInput value={reading} onChangeText={setReading} keyboardType="decimal-pad" placeholder="Scale shows (g)" placeholderTextColor={color.placeholder} style={s.input} accessibilityLabel="Scale reading" />
              {read !== null && (total ?? 0) <= 0 && <Text style={[type.small, { color: color.over }]}>That’s no more than the {plate?.name.toLowerCase() ?? 'plate'} itself.</Text>}
            </View>

            <Pressable onPress={send} disabled={!ready} style={[s.primary, !ready && { opacity: 0.4 }]}>
              <Text style={s.primaryText}>Send to Bell to log</Text>
            </Pressable>
            <Text style={type.small}>Bell looks up the nutrition and shows the review card; nothing is logged until you tap Add.</Text>
            <Pressable onPress={() => { setStage('start'); setItems([]); setPhoto(null); }} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={s.link}>Measure again</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The photo with each food's box. The camera sees in landscape, so the photo
 * and its boxes turn together to stand upright on the phone.
 */
function PlateView({ photo, boxes }: { photo: Photo; boxes: [number, number, number, number][] }) {
  const [w, setW] = useState(0);
  const h = w * (photo.width / photo.height);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[s.photo, { height: h || 1 }]}>
      {w > 0 && (
        <View style={{ position: 'absolute', width: h, height: w, left: (w - h) / 2, top: (h - w) / 2, transform: [{ rotate: '90deg' }] }}>
          <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} accessibilityLabel="Your plate" />
          {boxes.map((b, i) => (
            <View
              key={i}
              style={{ position: 'absolute', left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${(b[2] - b[0]) * 100}%`, height: `${(b[3] - b[1]) * 100}%`, borderWidth: 3, borderColor: COLORS[i % COLORS.length], borderRadius: 8 }}
            >
              <View style={[s.dot, { backgroundColor: COLORS[i % COLORS.length], transform: [{ rotate: '-90deg' }], margin: 4 }]}><Text style={s.dotText}>{i + 1}</Text></View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  primary: { flexDirection: 'row', gap: space(2), alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, borderRadius: radius.row, paddingVertical: space(4) },
  primaryText: { color: color.onAccent, fontWeight: '800', fontSize: 16 },
  photo: { width: '100%', overflow: 'hidden', borderRadius: radius.card, backgroundColor: color.raised },
  card: { backgroundColor: color.card, borderRadius: radius.row, padding: space(3), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  grams: { width: 100, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
