// Settings → Training setup → Heart rate sensor: find a watch broadcasting
// heart rate (a Garmin with Broadcast Heart Rate on) or a chest strap, and
// keep it for workouts. The rest coach then has a live reading every second
// instead of waiting for Apple Health.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { heartSensorSupported, scanHeartSensors, type HeartSensor } from '../modules/forkbell-heart';
import { saveHeartSensor, savedHeartSensor, useLiveHeartRate } from '../lib/heart';
import { color, radius, space, type } from '../lib/theme';

export function HeartSensorSettings() {
  const [saved, setSaved] = useState(savedHeartSensor());
  const [found, setFound] = useState<HeartSensor[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const live = useLiveHeartRate(testing);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!testing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [testing]);

  if (!heartSensorSupported)
    return (
      <View style={s.card}>
        <Text style={type.label}>Heart rate sensor</Text>
        <Text style={type.small}>Live heart rate from a watch or chest strap needs the iPhone app, in a build made after this update.</Text>
      </View>
    );

  const scan = async () => {
    setProblem(null);
    setFound(null);
    setScanning(true);
    try {
      setFound(await scanHeartSensors(8));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };
  const pick = (sensor: HeartSensor) => {
    saveHeartSensor({ id: sensor.id, name: sensor.name });
    setSaved({ id: sensor.id, name: sensor.name });
    setFound(null);
    setTesting(true);
  };
  const fresh = live.reading && now - live.reading.at < 10_000 ? live.reading : null;

  return (
    <View style={s.card}>
      <Text style={type.label}>Heart rate sensor</Text>
      <Text style={type.small}>
        For a live heart rate during rests (the ♥ on the rest bar and the rest coach), from a watch broadcasting its heart rate or a chest strap. On a Garmin, turn on Broadcast Heart Rate first: on most models it’s in Settings → Wrist Heart Rate (or Health & Wellness → Wrist Heart Rate), and during an activity in its controls menu. It uses more watch battery while it’s on.
      </Text>
      {saved ? (
        <View style={s.row}>
          <Ionicons name="heart" size={20} color={color.over} />
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '700' }]}>{saved.name}</Text>
            <Text style={type.small}>
              {testing
                ? fresh
                  ? `Live: ${fresh.bpm} bpm`
                  : live.state === 'connected'
                    ? 'Connected, waiting for a reading…'
                    : live.state === 'bluetoothOff'
                      ? 'Bluetooth is off'
                      : live.state === 'unauthorized'
                        ? 'Bluetooth isn’t allowed for Forkbell (Settings → Forkbell)'
                        : 'Looking for it… (is it broadcasting?)'
                : 'Used during workouts'}
            </Text>
          </View>
          <Pressable onPress={() => setTesting((t) => !t)} hitSlop={8}><Text style={s.link}>{testing ? 'Stop' : 'Test'}</Text></Pressable>
          <Pressable onPress={() => { setTesting(false); saveHeartSensor(null); setSaved(null); }} hitSlop={8}><Text style={[s.link, { color: color.over }]}>Forget</Text></Pressable>
        </View>
      ) : null}
      <Pressable onPress={() => void scan()} disabled={scanning} style={[s.button, scanning && { opacity: 0.6 }]} accessibilityRole="button">
        {scanning ? <ActivityIndicator color={color.chalk} /> : <Text style={s.buttonText}>{saved ? 'Find a different one' : 'Find my watch or strap'}</Text>}
      </Pressable>
      {found && found.length === 0 && <Text style={type.small}>Nothing found. Make sure it’s broadcasting heart rate and close by, then try again.</Text>}
      {found?.map((f) => (
        <Pressable key={f.id} onPress={() => pick(f)} style={({ pressed }) => [s.row, s.found, pressed && { opacity: 0.6 }]} accessibilityRole="button">
          <Ionicons name="watch-outline" size={20} color={color.accent} />
          <Text style={[type.body, { flex: 1 }]}>{f.name}</Text>
          <Text style={s.link}>Use</Text>
        </Pressable>
      ))}
      {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(2), marginTop: space(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  found: { paddingVertical: space(2), borderTopWidth: 1, borderColor: color.line },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  buttonText: { color: color.chalk, fontWeight: '700' },
  link: { color: color.accent, fontWeight: '700' },
});
