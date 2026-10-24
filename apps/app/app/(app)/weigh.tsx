// Weigh a meal on your kitchen scale, food by food. Tare between foods and
// type each weight, or keep the scale running and type what it shows after
// each food. Pick a plate or bowl you've weighed once and you don't even
// need to tare. Leftovers come off. Everything is logged at once.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { eatenGrams, forAmount, gramsFromScale, MEALS, mealForTime, parseWeight, todayLocal, type Food, type FoodCandidate, type Meal, type RecentFoods, type WeighMode } from '@forkbell/shared';
import { api, ApiError, put } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cachedGet } from '../../lib/sync';
import { addEntry, searchOffline } from '../../lib/actions';
import { confirm } from '../../lib/confirm';
import { showToast } from '../../lib/toast';
import { Chip, MEAL_NAMES } from '../../components/AmountPicker';
import { VoiceButton, voiceAvailable } from '../../components/VoiceButton';
import { color, radius, space, type } from '../../lib/theme';

type Pick = Food | FoodCandidate;
type Item = { key: number; food: Pick; value: string; leftover: string | null };
type Container = { id: string; name: string; grams: number };
const idOf = (f: Pick) => ('id' in f ? f.id : null);
let nextKey = 1;

export default function Weigh() {
  const params = useLocalSearchParams<{ meal?: Meal; date?: string }>();
  const date = params.date ?? todayLocal();
  const { me, refreshMe } = useAuth();
  const containers: Container[] = me?.preferences.containers ?? [];
  const [meal, setMeal] = useState<Meal>(params.meal && (MEALS as readonly string[]).includes(params.meal) ? params.meal : mealForTime());
  const [plateId, setPlateId] = useState<string | null>(null);
  const [mode, setMode] = useState<WeighMode>('tare');
  const [items, setItems] = useState<Item[]>([]);
  const [picking, setPicking] = useState(false);
  const [recent, setRecent] = useState<RecentFoods | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = voiceAvailable();

  useEffect(() => {
    cachedGet<RecentFoods>(`/api/foods/recent?today=${todayLocal()}`).then(setRecent, () => setRecent({ recent: [], frequent: [] }));
  }, []);

  const plate = containers.find((c) => c.id === plateId) ?? null;
  // Picking a saved plate means you can keep the scale running: no taring needed.
  const pickPlate = (id: string | null) => {
    setPlateId(id);
    if (id) setMode('total');
  };
  const weighed = gramsFromScale(mode, items.map((i) => parseWeight(i.value)), mode === 'total' ? (plate?.grams ?? 0) : 0);
  const eaten = items.map((it, k) => (weighed[k] == null ? null : eatenGrams(weighed[k]!, it.leftover ? parseWeight(it.leftover) : null, plate?.grams ?? 0)));
  const kcal = items.reduce((n, it, k) => n + (eaten[k] ? forAmount(it.food.per100, eaten[k]!).kcal : 0), 0);
  const ready = items.length > 0 && eaten.every((g) => g !== null);
  const lastGrams = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of [...(recent?.frequent ?? []), ...(recent?.recent ?? [])]) m.set(r.food.id, r.lastGrams);
    return m;
  }, [recent]);

  const update = (key: number, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const log = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const [k, it] of items.entries()) if (eaten[k]) await addEntry({ date, meal, grams: eaten[k]!, food: it.food });
      showToast(`Logged ${items.length} ${items.length === 1 ? 'food' : 'foods'} to ${MEAL_NAMES[meal]}, ${Math.round(kcal)} kcal`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const how =
    mode === 'tare'
      ? 'Put the plate on the scale and press tare. Add a food, type the number, press tare again, and add the next.'
      : plate
        ? `Put the empty ${plate.name.toLowerCase()} on the scale (no tare). After each food, type what the scale shows: Forkbell takes off the ${plate.name.toLowerCase()} and the foods before it.`
        : 'Put the empty plate on, press tare once, then after each food type what the scale shows. Forkbell works out each food.';

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
          <Text style={[type.hero, { fontSize: 30 }]}>Weigh your meal</Text>

          <View style={s.chips}>
            {MEALS.map((m) => <Chip key={m} label={MEAL_NAMES[m]} on={meal === m} onPress={() => setMeal(m)} />)}
          </View>

          <Text style={type.label}>On</Text>
          <View style={s.chips}>
            <Chip label="Tared plate" on={!plateId} onPress={() => pickPlate(null)} />
            {containers.map((c) => <Chip key={c.id} label={`${c.name} (${c.grams} g)`} on={plateId === c.id} onPress={() => pickPlate(c.id)} />)}
          </View>

          <View style={s.tabs} accessibilityRole="tablist">
            {(['tare', 'total'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[s.tab, mode === m && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
                <Text style={[s.tabText, mode === m && { color: color.onAccent }]}>{m === 'tare' ? 'Tare between foods' : 'Type the scale’s total'}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={type.small}>{how}</Text>

          {items.map((it, k) => {
            const g = weighed[k];
            const last = idOf(it.food) ? lastGrams.get(idOf(it.food)!) : undefined;
            const typed = parseWeight(it.value);
            return (
              <View key={it.key} style={s.card}>
                <View style={s.row}>
                  <Text style={[type.body, { flex: 1, fontWeight: '700' }]} numberOfLines={2}>{it.food.name}{it.food.brand ? ` · ${it.food.brand}` : ''}</Text>
                  <Pressable onPress={() => setItems((l) => l.filter((x) => x.key !== it.key))} hitSlop={10} accessibilityLabel={`Remove ${it.food.name}`}>
                    <Ionicons name="close-circle-outline" size={22} color={color.ironSoft} />
                  </Pressable>
                </View>
                <View style={s.row}>
                  <TextInput
                    value={it.value}
                    onChangeText={(v) => update(it.key, { value: v })}
                    keyboardType="decimal-pad"
                    placeholder={mode === 'tare' ? 'grams' : 'scale shows'}
                    placeholderTextColor={color.placeholder}
                    style={[s.input, s.big, it.value && typed !== null && g === null && { borderColor: color.over }]}
                    autoFocus={k === items.length - 1 && !it.value}
                    accessibilityLabel={mode === 'tare' ? `Grams of ${it.food.name}` : `Scale reading after adding ${it.food.name}`}
                  />
                  {voice && (
                    <VoiceButton
                      onHearing={() => {}}
                      onDone={(words) => {
                        const w = parseWeight(words);
                        if (w) update(it.key, { value: String(w) });
                        else setError(`Didn’t catch a weight in “${words}”. Say it like “182 grams”.`);
                      }}
                      onError={setError}
                    />
                  )}
                  <Text style={[type.body, { flex: 1, textAlign: 'right' }]}>
                    {eaten[k] != null ? `${eaten[k]} g · ${Math.round(forAmount(it.food.per100, eaten[k]!).kcal)} kcal` : ''}
                  </Text>
                </View>
                {mode === 'total' && it.value && typed !== null && g === null && (
                  <Text style={[type.small, { color: color.over }]}>That’s not more than the reading before. Type the total the scale shows now.</Text>
                )}
                {mode === 'tare' && !it.value && last ? (
                  <Pressable onPress={() => update(it.key, { value: String(last) })} hitSlop={6}>
                    <Text style={s.small}>Last time {last} g, tap to use</Text>
                  </Pressable>
                ) : null}
                {it.leftover === null ? (
                  <Pressable onPress={() => update(it.key, { leftover: '' })} hitSlop={6}><Text style={s.small}>Didn’t finish it? Weigh what’s left</Text></Pressable>
                ) : (
                  <View style={s.row}>
                    <Text style={[type.small, { flex: 1 }]}>{plate ? `Left over, with the ${plate.name.toLowerCase()} on the scale` : 'Grams left over'}</Text>
                    <TextInput value={it.leftover} onChangeText={(v) => update(it.key, { leftover: v })} keyboardType="decimal-pad" placeholder="g" placeholderTextColor={color.placeholder} style={[s.input, { width: 90, textAlign: 'center' }]} accessibilityLabel={`Leftover ${it.food.name}`} />
                    <Pressable onPress={() => update(it.key, { leftover: null })} hitSlop={8} accessibilityLabel="No leftovers"><Ionicons name="close" size={18} color={color.ironSoft} /></Pressable>
                  </View>
                )}
              </View>
            );
          })}

          <Pressable onPress={() => setPicking(true)} style={s.add}>
            <Ionicons name="add" size={20} color={color.accent} />
            <Text style={s.link}>{items.length ? 'Add the next food' : 'Add the first food'}</Text>
          </Pressable>

          {error && <Text style={{ color: color.over }}>{error}</Text>}
          {items.length > 0 && (
            <Pressable onPress={log} disabled={!ready || saving} style={[s.primary, (!ready || saving) && { opacity: 0.4 }]}>
              {saving ? <ActivityIndicator color={color.onAccent} /> : <Text style={s.primaryText}>Log {items.length} to {MEAL_NAMES[meal]} · {Math.round(kcal)} kcal</Text>}
            </Pressable>
          )}

          <Containers
            list={containers}
            onSave={async (next) => {
              await put('/api/me/preferences', { ...me!.preferences, containers: next });
              await refreshMe();
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <FoodPicker
        visible={picking}
        recent={recent}
        onClose={() => setPicking(false)}
        onPick={(food) => {
          setPicking(false);
          setItems((l) => [...l, { key: nextKey++, food, value: '', leftover: null }]);
        }}
      />
    </SafeAreaView>
  );
}

/** Plates and bowls weighed once, empty. */
function Containers({ list, onSave }: { list: Container[]; onSave: (next: Container[]) => Promise<void> }) {
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (next: Container[]) => {
    setProblem(null);
    try {
      await onSave(next);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  const g = parseWeight(grams);
  return (
    <View style={[s.card, { marginTop: space(6) }]}>
      <Text style={type.title}>Your plates and bowls</Text>
      <Text style={type.small}>Weigh each one empty, once. Then you can put a full one on the scale without taring, and weigh leftovers on it too.</Text>
      {list.map((c) => (
        <View key={c.id} style={s.row}>
          <Text style={[type.body, { flex: 1 }]}>{c.name}</Text>
          <Text style={type.body}>{c.grams} g</Text>
          <Pressable onPress={async () => (await confirm(`Remove ${c.name}?`, 'You can weigh it again any time.', 'Remove')) && run(list.filter((x) => x.id !== c.id))} hitSlop={8}>
            <Ionicons name="trash-outline" size={20} color={color.over} />
          </Pressable>
        </View>
      ))}
      <View style={s.row}>
        <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. Big plate" placeholderTextColor={color.placeholder} style={[s.input, { flex: 1 }]} />
        <TextInput value={grams} onChangeText={setGrams} placeholder="g empty" placeholderTextColor={color.placeholder} keyboardType="decimal-pad" style={[s.input, { width: 90, textAlign: 'center' }]} />
      </View>
      <Pressable
        disabled={!name.trim() || !g}
        onPress={async () => {
          await run([...list, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim().slice(0, 40), grams: Math.round(g!) }]);
          setName('');
          setGrams('');
        }}
        style={[s.secondary, (!name.trim() || !g) && { opacity: 0.4 }]}
      >
        <Text style={s.link}>Save it</Text>
      </Pressable>
      {problem && <Text style={{ color: color.over }}>{problem}</Text>}
    </View>
  );
}

/** Find a food: your recent ones, or search your foods and the databases. */
function FoodPicker({ visible, recent, onPick, onClose }: { visible: boolean; recent: RecentFoods | null; onPick: (f: Pick) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ mine: Food[]; results: FoodCandidate[] } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) setQ('');
  }, [visible]);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return setFound(null);
    let live = true;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api<{ mine: Food[]; results: FoodCandidate[] }>(`/api/foods/search?q=${encodeURIComponent(query)}`);
        if (live) setFound(r);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0 && live) setFound({ mine: await searchOffline(query), results: [] });
      } finally {
        if (live) setBusy(false);
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  const recentFoods = [...(recent?.recent ?? []), ...(recent?.frequent ?? [])].filter((r, i, all) => all.findIndex((x) => x.food.id === r.food.id) === i).slice(0, 15);
  const row = (f: Pick, key: string, detail?: string) => (
    <Pressable key={key} onPress={() => onPick(f)} style={({ pressed }) => [s.pick, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={1}>{f.name}</Text>
        <Text style={type.small} numberOfLines={1}>{[f.brand, `${Math.round(f.per100.kcal)} kcal per 100 g`, detail].filter(Boolean).join(' · ')}</Text>
      </View>
    </Pressable>
  );
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.row}>
            <TextInput value={q} onChangeText={setQ} placeholder="Search foods" placeholderTextColor={color.placeholder} style={[s.input, { flex: 1 }]} autoFocus returnKeyType="search" />
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space(1), paddingBottom: space(8) }}>
            {busy && <ActivityIndicator color={color.iron} />}
            {found ? (
              <>
                {found.mine.map((f) => row(f, f.id))}
                {found.results.map((f, i) => row(f, `${f.source}:${f.sourceId ?? i}`))}
                {!busy && !found.mine.length && !found.results.length && <Text style={type.small}>Nothing found. Try another word, or add the food from the Add screen first.</Text>}
              </>
            ) : (
              <>
                <Text style={type.label}>Recent</Text>
                {recentFoods.map((r) => row(r.food, r.food.id, `last ${r.lastGrams} g`))}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  small: { color: color.accent, fontWeight: '600', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  tabs: { flexDirection: 'row', backgroundColor: color.card, borderRadius: radius.pill, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(2) },
  tabOn: { backgroundColor: color.accent },
  tabText: { fontWeight: '700', color: color.iron, fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: color.card, borderRadius: radius.row, padding: space(3), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  big: { width: 120, fontSize: 22, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  add: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 48, justifyContent: 'center', borderRadius: radius.row, borderWidth: 1, borderColor: color.line, borderStyle: 'dashed' },
  primary: { backgroundColor: color.accent, borderRadius: radius.row, paddingVertical: space(4), alignItems: 'center' },
  primaryText: { color: color.onAccent, fontWeight: '800', fontSize: 16 },
  secondary: { minHeight: 44, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), gap: space(3), height: '80%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  pick: { paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: color.line },
});
