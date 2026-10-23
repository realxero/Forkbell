// Hold to talk: speech is turned into text on the device as you speak, and
// the words show up live so you can see it heard you. A quick tap starts
// listening hands-free instead; tap again to finish (this is also how it
// works with VoiceOver).
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { color } from '../lib/theme';

const HOLD_MS = 350;

/** Whether this device or browser can turn speech into text at all. */
export function voiceAvailable() {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

type Props = {
  disabled?: boolean;
  /** live words while listening ('' when it starts) */
  onHearing: (text: string, listening: boolean) => void;
  /** everything it heard, once listening stops */
  onDone: (text: string) => void;
  onError: (message: string) => void;
};

export function VoiceButton({ disabled, onHearing, onDone, onError }: Props) {
  const [listening, setListening] = useState(false);
  const finals = useRef<string[]>([]);
  const interim = useRef('');
  const pressedAt = useRef(0);
  const handsFree = useRef(false);
  const onDevice = useRef(Platform.OS === 'ios');
  const heard = () => [...finals.current, interim.current].join(' ').replace(/\s+/g, ' ').trim();

  const begin = () => {
    finals.current = [];
    interim.current = '';
    ExpoSpeechRecognitionModule.start({
      lang: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      // Keep audio on the iPhone when it can do the recognition itself.
      requiresOnDeviceRecognition: onDevice.current && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
      contextualStrings: ['grams', 'protein', 'breakfast', 'lunch', 'dinner', 'snack'],
    });
  };

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    onHearing('', true);
  });
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      // iOS repeats everything so far in each result; Android sends one phrase at a time.
      if (Platform.OS === 'ios') finals.current = [t];
      else finals.current.push(t);
      interim.current = '';
    } else {
      interim.current = t;
    }
    onHearing(heard(), true);
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    handsFree.current = false;
    onHearing('', false);
    onDone(heard());
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'aborted') return;
    if (e.error === 'language-not-supported' && onDevice.current) {
      // This language isn't downloaded for on-device use; Apple's servers can still do it.
      onDevice.current = false;
      onError('Your language isn’t available offline on this iPhone, so Apple’s servers will do the listening. Hold again to talk.');
      return;
    }
    onError(
      e.error === 'no-speech' || e.error === 'speech-timeout'
        ? 'I didn’t catch anything. Hold the mic and speak, then let go.'
        : e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone or speech recognition is off for Forkbell. You can turn them on in Settings.'
          : e.error === 'network'
            ? 'Speech recognition needs a connection here.'
            : `Couldn’t listen: ${e.message || e.error}.`,
    );
  });

  const pressIn = async () => {
    if (disabled) return;
    if (listening) return; // a second tap ends hands-free mode, in pressOut
    pressedAt.current = Date.now();
    const perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (!perm.granted) {
      const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!asked.granted) return onError('Microphone or speech recognition is off for Forkbell. You can turn them on in Settings.');
      return onError('All set. Hold the mic to talk.');
    }
    begin();
  };

  const pressOut = () => {
    if (handsFree.current) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    if (Date.now() - pressedAt.current < HOLD_MS) {
      handsFree.current = true; // a tap: keep listening until the next tap
      return;
    }
    ExpoSpeechRecognitionModule.stop();
  };

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      style={[s.button, listening && s.on, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop listening' : 'Talk to Bell'}
      accessibilityHint="Hold to talk and let go to finish, or tap to start and tap again to finish."
      accessibilityState={{ busy: listening }}
    >
      <Ionicons name={listening ? 'mic' : 'mic-outline'} size={22} color={listening ? color.onAccent : color.iron} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.chalk },
  on: { backgroundColor: color.over },
});
