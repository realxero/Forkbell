import { useAuth } from '../../lib/auth';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dataKind, forAmount, KIND_INFO, mealForTime, type NutritionCheck, per100Problems, todayLocal, type Food, type FoodCandidate, type LabelFood, type Meal, type RecentFood, type RecentFoods, entryAmountText } from '@forkbell/shared';
import { api, ApiError, post } from '../../lib/api';
import { pickImage } from '../../lib/images';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cachedGet } from '../../lib/sync';
import { addEntry, createFood, findByBarcodeOffline, foodLibrary, searchOffline } from '../../lib/actions';
import { AmountPicker, Chip, MEAL_NAMES } from '../../components/AmountPicker';
import { BarcodeCamera } from '../../components/BarcodeCamera';
import { FoodIcon } from '../../components/FoodIcon';
import { MealShortcuts } from '../../components/MealShortcuts';
import { color, space, type } from '../../lib/theme';

type Pick = Food | FoodCandidate;
type SearchResult = { mine: Food[]; results: FoodCandidate[]; errors: string[] };
type BarcodeResult = { food?: Food; candidate?: FoodCandidate; check?: NutritionCheck | null };
type Screen = { kind: 'search' } | { kind: 'scan' } | { kind: 'amount'; food: Pick; lastGrams?: number; check?: NutritionCheck | null } | { kind: 'create'; barcode?: string; note?: string; prefill?: { name: string; brand: string | null } };

export default function AddFood() {
  const { me } = useAuth();
  const params = useLocalSearchParams<{ meal?: Meal; date?: string; scan?: string }>();
  const meal = params.meal ?? mealForTime();
  const date = params.date ?? todayLocal();

  const [view, setView] = useState<Screen>(params.scan ? { kind: 'scan' } : { kind: 'search' });
  const [q, setQ] = useState('');
  const [found, setFound] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<RecentFoods | null>(null);
  const [tab, setTab] = useState<'recent' | 'frequent'>('recent');
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [canReadLabels, setCanReadLabels] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>('/api/bell/status').then((r) => setCanReadLabels(r.enabled), () => setCanReadLabels(false));
    cachedGet<RecentFoods>(`/api/foods/recent?today=${todayLocal()}`).then(setRecent, () => setRecent({ recent: [], frequent: [] }));
    void foodLibrary(); // keep a copy for searching offline
  }, []);

  // Search 350 ms after typing stops; ignore answers to older queries.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return setFound(null);
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api<SearchResult>(`/api/foods/search?q=${encodeURIComponent(query)}`);
        if (live) setFound(r);
      } catch (e) {
        // No connection: search the foods kept on this device.
        if (e instanceof ApiError && e.status === 0) {
          const mine = await searchOffline(query);
          if (live) setFound({ mine, results: [], errors: ['Offline: showing your foods and common foods only.'] });
        } else if (live) setError(message(e));
      } finally {
        if (live) setSearching(false);
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const log = async (food: Pick, grams: number, toMeal: Meal, said?: { amount: number; unit: string }) => {
    setError(null);
    await addEntry({ date, meal: toMeal, grams, food, ...(said ?? {}) });
  };

  /** One tap: log a recent food with last time's amount and stay here to add more. */
  const quickAdd = async (r: RecentFood) => {
    try {
      const said = r.lastAmount && r.lastUnit ? { amount: r.lastAmount, unit: r.lastUnit } : undefined;
      await log(r.food, r.lastGrams, meal, said);
      setAdded((a) => [...a, `${r.food.name}, ${entryAmountText({ grams: r.lastGrams, amount: r.lastAmount, unit: r.lastUnit, food: r.food }, me?.weightUnit ?? 'lb')}`]);
    } catch (e) {
      setError(message(e));
    }
  };

  const onCode = useCallback(async (code: string) => {
    setError(null);
    try {
      const r = await api<BarcodeResult>(`/api/foods/barcode/${encodeURIComponent(code)}`);
      const food = r.food ?? r.candidate;
      if (food) setView({ kind: 'amount', food, check: r.check ?? null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        const known = await findByBarcodeOffline(code);
        if (known) return setView({ kind: 'amount', food: known });
        return setView({ kind: 'create', barcode: code.replace(/\D/g, ''), note: 'You’re offline and this barcode isn’t saved on this device. Add it from the label and it syncs later.' });
      }
      // Not found (or Open Food Facts is down): offer to add it, with the barcode filled in.
      setView({ kind: 'create', barcode: code.replace(/\D/g, ''), note: message(e) });
    }
  }, []);

  const lastGramsFor = (food: Pick) => ('id' in food ? recent?.recent.concat(recent.frequent).find((r) => r.food.id === food.id)?.lastGrams : undefined);

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.head}>
          <Text style={type.title}>
            {view.kind === 'scan' ? 'Scan a barcode' : view.kind === 'create' ? 'New food' : view.kind === 'amount' ? 'How much?' : `Add to ${MEAL_NAMES[meal]}`}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.link}>{added.length ? 'Done' : 'Close'}</Text>
          </Pressable>
        </View>

        {view.kind === 'amount' ? (
          <AmountPicker
            food={view.food}
            initialMeal={meal}
            lastGrams={view.lastGrams ?? lastGramsFor(view.food)}
            date={date}
            submitLabel={(m) => `Add to ${MEAL_NAMES[m]}`}
            error={error}
            onSubmit={async (g, m, said) => {
              try {
                await log(view.food, g, m, said);
                router.back();
              } catch (e) {
                setError(message(e));
              }
            }}
          >
            {view.check && (
              // A scanned product checked against a second database.
              <View style={[s.check, !view.check.agrees && s.checkOff]} accessibilityLiveRegion="polite">
                <Ionicons name={view.check.agrees ? 'checkmark-circle' : 'alert-circle'} size={18} color={view.check.agrees ? color.fat : color.carbs} />
                <Text style={[type.small, { flex: 1, color: color.iron }]}>{view.check.text}</Text>
              </View>
            )}
            {view.food.barcode ? (
              // Barcode data is crowd-sourced and sometimes wrong. Your corrected copy is what scans from then on.
              <Pressable
                onPress={() =>
                  setView({
                    kind: 'create',
                    barcode: view.food.barcode ?? undefined,
                    prefill: { name: view.food.name, brand: view.food.brand },
                    note: canReadLabels
                      ? 'Take a photo of the nutrition label and check the numbers, then save. Your corrected version is what scans from now on.'
                      : 'Type the numbers from the label, then save. Your corrected version is what scans from now on.',
                  })
                }
                style={s.secondary}
              >
                <Text style={s.link}>Numbers look wrong? Fix them from the label</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => { setError(null); setView({ kind: 'search' }); }} style={s.secondary}>
              <Text style={s.link}>Pick a different food</Text>
            </Pressable>
          </AmountPicker>
        ) : view.kind === 'create' ? (
          <CreateFood
            initialName={view.prefill?.name ?? q}
            initialBrand={view.prefill?.brand ?? ''}
            barcode={view.barcode}
            note={view.note}
            canReadLabels={canReadLabels}
            onCreated={(f) => setView({ kind: 'amount', food: f })}
            onCancel={() => setView({ kind: 'search' })}
          />
        ) : view.kind === 'scan' ? (
          <Scanner onCode={onCode} onCancel={() => setView({ kind: 'search' })} error={error} />
        ) : (
          <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
            <View style={s.searchRow}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search foods or brands"
                autoFocus={Platform.OS === 'web'}
                style={[s.input, { flex: 1 }]}
                returnKeyType="search"
              />
              <Pressable onPress={() => { setError(null); setView({ kind: 'scan' }); }} style={s.scanButton} accessibilityLabel="Scan a barcode">
                <Text style={s.scanText}>Scan</Text>
              </Pressable>
            </View>
            {error && <Text style={s.error}>{error}</Text>}
            {added.length > 0 && <Text style={s.added}>Added {added.join('; ')}</Text>}

            {q.trim().length < 2 ? (
              <>
              <MealShortcuts date={date} meal={meal} onLogged={(t) => setAdded((x) => [...x, t])} />
              <RecentList data={recent} tab={tab} setTab={setTab} onPick={(r) => setView({ kind: 'amount', food: r.food, lastGrams: r.lastGrams })} onQuickAdd={quickAdd} />
              </>
            ) : (
              <>
                {searching && <ActivityIndicator color={color.iron} />}
                {found?.errors.map((m) => <Text key={m} style={type.small}>{m}</Text>)}

                {found && found.mine.length > 0 && <Text style={s.section}>Your foods and common foods</Text>}
                {found?.mine.map((f) => <Row key={f.id} food={f} onPress={() => setView({ kind: 'amount', food: f })} />)}

                {found && found.results.length > 0 && (
                  <>
                    <Text style={s.section}>Food databases</Text>
                    <Text style={type.small}>Best match first; among similar ones, lab-measured and makers’ labels before community entries.</Text>
                  </>
                )}
                {found?.results.map((f) => <Row key={`${f.source}:${f.sourceId}`} food={f} onPress={() => setView({ kind: 'amount', food: f })} />)}

                {found && !searching && found.mine.length + found.results.length === 0 && (
                  <Text style={type.body}>Nothing matches “{q.trim()}”. Add it as your own food below.</Text>
                )}
              </>
            )}
            <Pressable onPress={() => setView({ kind: 'create' })} style={{ paddingVertical: space(3) }}>
              <Text style={s.link}>Create your own food</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function RecentList({
  data,
  tab,
  setTab,
  onPick,
  onQuickAdd,
}: {
  data: RecentFoods | null;
  tab: 'recent' | 'frequent';
  setTab: (t: 'recent' | 'frequent') => void;
  onPick: (r: RecentFood) => void;
  onQuickAdd: (r: RecentFood) => void;
}) {
  const { me } = useAuth();
  if (!data) return <ActivityIndicator color={color.iron} style={{ marginTop: space(4) }} />;
  if (!data.recent.length) return <Text style={[type.small, { marginTop: space(2) }]}>Foods you log show up here, so the next time takes one tap.</Text>;
  const list = data[tab];
  return (
    <>
      <View style={[s.searchRow, { marginTop: space(2) }]}>
        <Chip label="Recent" on={tab === 'recent'} onPress={() => setTab('recent')} />
        <Chip label="Most logged" on={tab === 'frequent'} onPress={() => setTab('frequent')} />
      </View>
      {list.length === 0 && <Text style={type.small}>Foods you log more than once show up here.</Text>}
      {list.map((r) => (
        <Pressable key={r.food.id} onPress={() => onPick(r)} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
          <FoodIcon name={r.food.name} brand={r.food.brand} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={type.body} numberOfLines={1}>{r.food.name}</Text>
            <Text style={type.small} numberOfLines={1}>
              {entryAmountText({ grams: r.lastGrams, amount: r.lastAmount, unit: r.lastUnit, food: r.food }, me?.weightUnit ?? 'lb')} · {forAmount(r.food.per100, r.lastGrams).kcal} kcal{r.food.brand ? ` · ${r.food.brand}` : ''}
            </Text>
          </View>
          <Pressable onPress={() => onQuickAdd(r)} hitSlop={8} style={s.plus} accessibilityLabel={`Add ${r.lastGrams} grams of ${r.food.name}`}>
            <Text style={s.plusText}>+</Text>
          </Pressable>
        </Pressable>
      ))}
    </>
  );
}

function Row({ food, onPress }: { food: Pick; onPress: () => void }) {
  const serving = food.servingGrams ? forAmount(food.per100, food.servingGrams).kcal : null;
  const portion = food.portions[0];
  // Where the numbers come from, so a lab-measured food and a community entry don't look the same.
  const kind = KIND_INFO[dataKind(food)];
  const trusted = kind.trust >= 1.2;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
      accessibilityLabel={`${food.name}${food.brand ? `, ${food.brand}` : ''}. ${kind.about}`}
    >
      <FoodIcon name={food.name} brand={food.brand} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={2}>{food.name}</Text>
        <Text style={type.small} numberOfLines={1}>
          {food.brand ? `${food.brand} · ` : ''}
          <Text style={{ color: trusted ? color.fat : color.ironSoft, fontWeight: '700' }}>{trusted ? '✓ ' : ''}{kind.tag}</Text>
        </Text>
      </View>
      <Text style={[type.small, type.number, { textAlign: 'right' }]}>
        {serving !== null
          ? `${serving} kcal\nper serving`
          : portion
            ? `${forAmount(food.per100, portion.grams).kcal} kcal\n${portion.label}`
            : `${Math.round(food.per100.kcal)} kcal\nper 100 g`}
      </Text>
    </Pressable>
  );
}

function Scanner({ onCode, onCancel, error }: { onCode: (code: string) => Promise<void>; onCancel: () => void; error: string | null }) {
  const [typed, setTyped] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [looking, setLooking] = useState<string | null>(null);
  const digits = typed.replace(/\D/g, '');

  const lookUp = useCallback(
    async (code: string) => {
      setLooking(code);
      await onCode(code);
      setLooking(null);
    },
    [onCode],
  );

  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      {looking ? (
        <View style={{ alignItems: 'center', gap: space(3), paddingVertical: space(10) }}>
          <ActivityIndicator color={color.iron} />
          <Text style={type.body}>Looking up {looking}…</Text>
        </View>
      ) : cameraError ? (
        <Text style={s.error}>{cameraError}</Text>
      ) : (
        <>
          <BarcodeCamera onCode={lookUp} onError={setCameraError} />
          <Text style={[type.small, { textAlign: 'center' }]}>Hold the barcode inside the box.</Text>
        </>
      )}
      {error && <Text style={s.error}>{error}</Text>}

      <Text style={[s.section, { marginTop: space(4) }]}>Or type the number</Text>
      <View style={s.searchRow}>
        <TextInput value={typed} onChangeText={setTyped} keyboardType="number-pad" placeholder="e.g. 0012345678905" style={[s.input, { flex: 1 }]} />
        <Pressable disabled={digits.length < 6 || Boolean(looking)} onPress={() => lookUp(digits)} style={[s.scanButton, (digits.length < 6 || looking) && { opacity: 0.4 }]}>
          <Text style={s.scanText}>Look up</Text>
        </Pressable>
      </View>
      <Pressable onPress={onCancel} style={s.secondary}>
        <Text style={s.link}>Back to search</Text>
      </Pressable>
    </ScrollView>
  );
}

function CreateFood({ initialName, initialBrand, barcode, note, canReadLabels, onCreated, onCancel }: { initialName: string; initialBrand?: string; barcode?: string; note?: string; canReadLabels: boolean; onCreated: (f: Food) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: initialName.trim(), brand: initialBrand ?? '', kcal: '', protein: '', carbs: '', fat: '', serving: '', servingLabel: '', barcode: barcode ?? '' });
  /** Numbers as the label prints them: per serving (US labels) or per 100 g. */
  const [basis, setBasis] = useState<'serving' | '100g'>('serving');
  /** fiber, sugar and sodium from a label photo; there are no boxes for them, so they ride along */
  const [extra, setExtra] = useState<Partial<Record<'fiber' | 'sugar' | 'sodium', number | null>>>({});
  const [read, setRead] = useState<{ busy: boolean; basis?: LabelFood['basis']; note?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  /** scanning the barcode with the camera, instead of typing it */
  const [scanning, setScanning] = useState(false);
  const [scanProblem, setScanProblem] = useState<string | null>(null);
  const num = (v: string) => Number(v.replace(',', '.') || 0);
  const servingG = num(form.serving);
  // Stored per 100 g underneath, whichever way the label prints them.
  const k = basis === 'serving' ? (servingG > 0 ? 100 / servingG : NaN) : 1;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const per100 = { kcal: r1(num(form.kcal) * k), protein: r1(num(form.protein) * k), carbs: r1(num(form.carbs) * k), fat: r1(num(form.fat) * k), ...extra };
  const problem = form.kcal ? per100Problems(per100)[0] : null;
  const code = form.barcode.replace(/\D/g, '');
  const codeProblem = code && (code.length < 6 || code.length > 14) ? 'A barcode is 6 to 14 digits.' : null;
  const servingProblem = basis === 'serving' && form.kcal && !(servingG > 0) ? 'Add the serving size in grams (it’s on the label next to the serving, e.g. “1 bar (24 g)”).' : null;
  const blocked = !form.name.trim() || !form.kcal || Boolean(problem && !servingProblem) || Boolean(servingProblem) || Boolean(codeProblem) || Boolean(read?.busy);

  /** Photograph the label; Bell reads it and fills the boxes for you to check. Nothing is saved yet. */
  const readLabel = async () => {
    setError(null);
    const photo = await pickImage(true);
    if (!photo) return;
    if ('error' in photo) return setError(photo.error);
    setRead({ busy: true });
    try {
      const { food } = await post<{ food: LabelFood }>('/api/bell/label', { image: photo.image });
      const str = (n: number | null | undefined) => (n == null ? '' : String(n));
      // Show the numbers the way the label prints them: per serving when there's a serving size.
      const per = food.servingGrams ? food.servingGrams / 100 : 1;
      const at = (v: number | null | undefined, kcal = false) => (v == null ? '' : str(kcal ? Math.round(v * per) : Math.round(v * per * 10) / 10));
      setBasis(food.servingGrams ? 'serving' : '100g');
      setForm((f) => ({
        ...f,
        name: f.name || food.name || '',
        brand: f.brand || food.brand || '',
        kcal: at(food.per100.kcal, true),
        protein: at(food.per100.protein),
        carbs: at(food.per100.carbs),
        fat: at(food.per100.fat),
        serving: food.servingGrams ? str(food.servingGrams) : f.serving,
        servingLabel: food.servingLabel || f.servingLabel,
      }));
      setExtra({ fiber: food.per100.fiber ?? null, sugar: food.per100.sugar ?? null, sodium: food.per100.sodium ?? null });
      setRead({ busy: false, basis: food.basis, note: food.note });
    } catch (e) {
      setRead(null);
      setError(e instanceof ApiError && e.status === 0 ? 'Reading a label needs a connection. You can type the numbers in.' : message(e));
    }
  };

  const save = async () => {
    setError(null);
    try {
      const food = await createFood({
        name: form.name,
        brand: form.brand || null,
        source: 'custom',
        per100,
        servingGrams: servingG > 0 ? servingG : null,
        servingLabel: form.servingLabel.trim() || null,
        barcode: code || null,
      });
      onCreated(food);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : message(e));
    }
  };

  const field = (k: keyof typeof form, label: string, keyboard: 'decimal-pad' | 'number-pad' | 'default' = 'decimal-pad') => (
    <View style={{ flex: 1, gap: space(1) }}>
      <Text style={type.small}>{label}</Text>
      <TextInput value={form[k]} onChangeText={set(k)} keyboardType={keyboard} style={s.input} accessibilityLabel={label} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      {note && <Text style={type.body}>{note}</Text>}
      {canReadLabels && (
        <Pressable onPress={readLabel} disabled={read?.busy} style={[s.labelButton, read?.busy && { opacity: 0.6 }]} accessibilityLabel="Read the nutrition label from a photo">
          {read?.busy ? <ActivityIndicator color={color.accent} /> : <Ionicons name="camera-outline" size={20} color={color.accent} />}
          <Text style={s.labelButtonText}>{read?.busy ? 'Reading the label…' : read?.basis ? 'Read another photo' : 'Read the label from a photo'}</Text>
        </Pressable>
      )}
      {read?.basis && (
        <Text style={[type.small, s.readNote]}>
          {basis === 'serving' ? `Read per serving (${form.serving} g), as the label prints it.` : 'Read from the per-100 g column.'}{' '}
          Check each number against the label before saving.{read.note ? ` ${read.note}` : ''}
        </Text>
      )}
      {field('name', 'Name', 'default')}
      {field('brand', 'Brand (optional)', 'default')}
      <Text style={[type.label, { marginTop: space(2) }]}>Serving size</Text>
      <View style={s.searchRow}>{field('servingLabel', 'As on the label, e.g. 1 bar', 'default')}{field('serving', 'Grams in one serving')}</View>
      <Text style={[type.label, { marginTop: space(2) }]}>Nutrition</Text>
      <View style={[s.searchRow, { alignItems: 'center' }]}>
        <Text style={type.small}>The label’s numbers are</Text>
        <Chip label="Per serving" on={basis === 'serving'} onPress={() => setBasis('serving')} />
        <Chip label="Per 100 g" on={basis === '100g'} onPress={() => setBasis('100g')} />
      </View>
      <View style={s.searchRow}>{field('kcal', 'Calories')}{field('protein', 'Protein g')}</View>
      <View style={s.searchRow}>{field('carbs', 'Carbs g')}{field('fat', 'Fat g')}</View>
      {servingProblem && <Text style={s.error}>{servingProblem}</Text>}
      {basis === 'serving' && servingG > 0 && form.kcal ? <Text style={type.small}>That’s {Math.round(per100.kcal)} kcal per 100 g.</Text> : null}
      <View style={{ gap: space(1) }}>
        <Text style={type.small}>Barcode (optional, so it scans next time)</Text>
        <View style={s.searchRow}>
          <TextInput value={form.barcode} onChangeText={set('barcode')} keyboardType="number-pad" style={[s.input, { flex: 1 }]} accessibilityLabel="Barcode" placeholder="Scan it or type the number" placeholderTextColor={color.placeholder} />
          <Pressable onPress={() => { setScanProblem(null); setScanning((v) => !v); }} style={s.scanButton} accessibilityRole="button" accessibilityLabel={scanning ? 'Stop scanning' : 'Scan the barcode with the camera'}>
            <Text style={s.scanText}>{scanning ? 'Cancel' : 'Scan'}</Text>
          </Pressable>
        </View>
        {scanning && (
          <>
            <BarcodeCamera
              onCode={(code) => {
                setForm((f) => ({ ...f, barcode: code }));
                setScanning(false);
              }}
              onError={setScanProblem}
            />
            <Text style={[type.small, { textAlign: 'center' }]}>Hold the barcode inside the box.</Text>
          </>
        )}
        {scanProblem && <Text style={s.error}>{scanProblem}</Text>}
      </View>
      {(problem || codeProblem || error) && <Text style={s.error}>{error ?? problem ?? codeProblem}</Text>}
      <Pressable disabled={blocked} onPress={save} style={[s.button, blocked && { opacity: 0.4 }]}>
        <Text style={s.buttonText}>Save food</Text>
      </Pressable>
      <Pressable onPress={onCancel} style={s.secondary}>
        <Text style={s.link}>Back to search</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  check: { flexDirection: 'row', gap: space(2), alignItems: 'flex-start', padding: space(3), borderRadius: 10, backgroundColor: color.infoBg },
  checkOff: { backgroundColor: color.raised, borderWidth: 1, borderColor: color.carbs },
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space(4) },
  list: { padding: space(4), gap: space(2), paddingBottom: space(16), maxWidth: 640, width: '100%', alignSelf: 'center' },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  scanButton: { backgroundColor: color.iron, borderRadius: 10, paddingHorizontal: space(4), paddingVertical: space(3) },
  scanText: { color: color.chalk, fontWeight: '700', fontSize: 16 },
  section: { ...type.small, fontWeight: '700', marginTop: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, padding: space(3), borderRadius: 10 },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.iron, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: color.chalk, fontSize: 22, lineHeight: 24, fontWeight: '700' },
  added: { ...type.small, color: color.fat, fontWeight: '700' },
  error: { ...type.body, color: color.over },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center', marginTop: space(2) },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
  secondary: { alignSelf: 'center', padding: space(3), minHeight: 44, justifyContent: 'center' },
  labelButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: color.accent, backgroundColor: color.card },
  labelButtonText: { color: color.accent, fontWeight: '700', fontSize: 16 },
  readNote: { backgroundColor: color.infoBg, borderRadius: 10, padding: space(3), color: color.iron },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
});
