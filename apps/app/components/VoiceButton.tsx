// Hold to talk: speech is turned into text on the device as you speak, and
// the words show up live so you can see it heard you. A quick tap starts
// listening hands-free instead; tap again to finish (this is also how it
// works with VoiceOver).
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { color } from '../lib/theme';
import { BellAvatar } from './BellAvatar';

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
  /** bigger, accent-coloured, for the floating Ask Bell button */
  big?: boolean;
  /** a quick tap does this instead of hands-free listening (hold still talks) */
  onTap?: () => void;
};

// A long press in a phone browser can open the text-selection / context menu and cancel the
// press, which used to end the listening. onContextMenu isn't in React Native's Pressable
// types, so it's passed in as a plain props object (react-native-web forwards it).
const webOnly: object = Platform.OS === 'web' ? { onContextMenu: (e: { preventDefault?: () => void }) => e.preventDefault?.() } : {};

export function VoiceButton({ disabled, onHearing, onDone, onError, big, onTap }: Props) {
  const [listening, setListening] = useState(false);
  const finals = useRef<string[]>([]);
  const interim = useRef('');
  // Words from earlier stretches of the same hold (see the restart in 'end' below).
  const carry = useRef('');
  const pressedAt = useRef(0);
  const held = useRef(false);
  const handsFree = useRef(false);
  const onDevice = useRef(Platform.OS === 'ios');
  // Speech events go to every mounted listener, so each button only reacts while it owns a
  // session: idle -> starting -> listening -> stopping -> idle (set only by this button).
  const phase = useRef<'idle' | 'starting' | 'listening' | 'stopping'>('idle');
  const stopWhenStarted = useRef(false); // let go before the mic had started
  const cancelStart = useRef(false); // a quick tap that went to onTap: don't start listening afterwards
  const discard = useRef(false); // throw this session's words away
  const failed = useRef(false); // an error came in during this session
  const restarts = useRef(0);
  const last = useRef({ text: '', at: 0 });
  const heard = () => [carry.current, ...finals.current, interim.current].join(' ').replace(/\s+/g, ' ').trim();

  const begin = (resume = false) => {
    if (phase.current !== 'idle' && !resume) return;
    phase.current = 'starting';
    stopWhenStarted.current = false;
    failed.current = false;
    if (resume) {
      carry.current = heard();
    } else {
      carry.current = '';
      discard.current = false;
      restarts.current = 0;
    }
    finals.current = [];
    interim.current = '';
    try {
      ExpoSpeechRecognitionModule.start({
        lang: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        // Keep audio on the iPhone when it can do the recognition itself.
        requiresOnDeviceRecognition: onDevice.current && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
        contextualStrings: ['grams', 'protein', 'breakfast', 'lunch', 'dinner', 'snack'],
      });
    } catch (e) {
      phase.current = 'idle';
      onError(`Couldn’t listen: ${e instanceof Error ? e.message : String(e)}.`);
    }
  };

  const finish = () => {
    if (phase.current === 'listening') {
      phase.current = 'stopping';
      ExpoSpeechRecognitionModule.stop();
    } else if (phase.current === 'starting') {
      stopWhenStarted.current = true;
    }
  };

  useSpeechRecognitionEvent('start', () => {
    if (phase.current !== 'starting') return;
    phase.current = 'listening';
    setListening(true);
    onHearing(heard(), true);
    if (stopWhenStarted.current) {
      stopWhenStarted.current = false;
      finish();
    }
  });
  useSpeechRecognitionEvent('result', (e) => {
    if (phase.current === 'idle') return;
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
    if (phase.current === 'idle') return;
    // Browsers stop listening by themselves after a pause. If your finger is still down,
    // carry on instead of treating that as letting go.
    if (phase.current === 'listening' && held.current && !handsFree.current && !discard.current && !failed.current && restarts.current < 20) {
      restarts.current += 1;
      begin(true);
      return;
    }
    const words = discard.current ? '' : heard();
    phase.current = 'idle';
    handsFree.current = false;
    carry.current = '';
    finals.current = [];
    interim.current = '';
    setListening(false);
    onHearing('', false);
    // The same words twice in a row is the same recording reported twice, not you repeating yourself.
    const again = words === last.current.text && Date.now() - last.current.at < 5000;
    if (words && !again) {
      last.current = { text: words, at: Date.now() };
      onDone(words);
    }
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (phase.current === 'idle') return;
    if (e.error === 'aborted') return;
    failed.current = true;
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
    pressedAt.current = Date.now();
    held.current = true;
    cancelStart.current = false;
    if (phase.current !== 'idle') return; // a second tap ends hands-free (in pressOut); or it's still wrapping up
    const perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (!perm.granted) {
      const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!asked.granted) return onError('Microphone or speech recognition is off for Forkbell. You can turn them on in Settings.');
      return onError('All set. Hold the mic to talk.');
    }
    // Let go (as a long press) or tapped away while that was being checked: don't start late.
    if (cancelStart.current || (!held.current && Date.now() - pressedAt.current >= HOLD_MS)) return;
    begin();
  };

  const pressOut = () => {
    held.current = false;
    if (handsFree.current) {
      finish();
      return;
    }
    const quick = Date.now() - pressedAt.current < HOLD_MS;
    if (quick && onTap) {
      cancelStart.current = true;
      discard.current = true;
      if (phase.current === 'listening' || phase.current === 'starting') {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          /* wasn't listening yet */
        }
      }
      onTap();
      return;
    }
    if (quick) {
      handsFree.current = true; // a tap: keep listening until the next tap
      return;
    }
    finish();
  };

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      {...webOnly}
      style={[s.button, big && s.big, listening && s.on, disabled && { opacity: 0.4 }, Platform.OS === 'web' && (s.noSelect as object)]}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop listening' : 'Talk to Bell'}
      accessibilityHint="Hold to talk and let go to finish, or tap to start and tap again to finish."
      accessibilityState={{ busy: listening }}
    >
      {big && !listening ? <BellAvatar size={38} tint={color.onAccent} face={color.accent} /> : <Ionicons name={listening ? 'mic' : 'mic-outline'} size={big ? 26 : 22} color={listening || big ? color.onAccent : color.iron} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.chalk },
  on: { backgroundColor: color.over },
  // web only (ignored elsewhere): no text selection, callout or browser touch gestures on the button
  noSelect: { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' } as object,
  big: { width: 58, height: 58, borderRadius: 29, backgroundColor: color.accent, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
