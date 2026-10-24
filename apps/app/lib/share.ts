// Share some text: the share sheet on phones (and in browsers that have one);
// elsewhere it's copied, with a note saying so. Never throws: a browser without
// sharing, or closing the sheet, isn't an error.
import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { showToast } from './toast';

export async function shareText(message: string) {
  const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  try {
    if (canShare) {
      await Share.share({ message });
      return;
    }
  } catch {
    // Closed the sheet, or the browser said no: fall back to copying.
  }
  try {
    await Clipboard.setStringAsync(message);
    showToast('Copied. Paste it wherever you like.');
  } catch {
    showToast('Couldn’t share or copy that here.');
  }
}
