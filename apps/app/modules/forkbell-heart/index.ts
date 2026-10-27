// Live heart rate from a Bluetooth sensor (a Garmin broadcasting heart rate,
// a chest strap), from JavaScript. Only on iPhone, and only in a build that
// includes this module; everywhere else heartSensorSupported is false.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type HeartSensor = { id: string; name: string; rssi: number };
export type HeartReading = { bpm: number; at: number };
export type HeartState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'notFound' | 'bluetoothOff' | 'unauthorized' | 'unsupported';

type Native = {
  isSupported(): boolean;
  scan(seconds: number): Promise<HeartSensor[]>;
  connect(id: string): void;
  disconnect(): void;
  latest(): HeartReading | null;
  state(): HeartState;
  addListener(event: 'onHeartRate', cb: (r: HeartReading) => void): { remove(): void };
  addListener(event: 'onState', cb: (s: { state: HeartState }) => void): { remove(): void };
};

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('ForkbellHeart') : null;

export const heartSensorSupported = (() => {
  try {
    return Boolean(native?.isSupported());
  } catch {
    return false;
  }
})();

export const scanHeartSensors = (seconds = 8) => native!.scan(seconds);
export const connectHeartSensor = (id: string) => native?.connect(id);
export const disconnectHeartSensor = () => native?.disconnect();
export const latestHeartReading = () => native?.latest() ?? null;
export const heartState = (): HeartState => native?.state() ?? 'unsupported';
export const onHeartRate = (cb: (r: HeartReading) => void) => native?.addListener('onHeartRate', cb) ?? { remove() {} };
export const onHeartState = (cb: (s: HeartState) => void) => native?.addListener('onState', (e) => cb(e.state)) ?? { remove() {} };
