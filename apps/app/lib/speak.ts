// Reading Bell's answers out loud: the phone's own voice in the app, the
// browser's on the web. Stops anything still speaking first.
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

/** Plain words for speaking: no markdown, links or emoji. */
export function speakable(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string) {
  const words = speakable(text);
  if (!words) return;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(words));
    return;
  }
  Speech.stop();
  Speech.speak(words);
}

export function stopSpeaking() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  } else Speech.stop();
}
