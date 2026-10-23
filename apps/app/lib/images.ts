// Getting a photo into a message: the camera, the photo library, the
// clipboard, or a pasted image link. Everything ends as a data: URL small
// enough for the server (which takes about 4 MB of text).
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';

export const MAX_IMAGE_CHARS = 3_900_000;
const TYPES = /^data:image\/(jpeg|png|webp|gif);base64,/;

export type ImageResult = { image: string } | { error: string } | null;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Couldn’t read that image.'));
    r.readAsDataURL(blob);
  });

/** On the web, redraw big images as a JPEG no wider or taller than 1600 px. */
async function shrinkOnWeb(url: string): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return url;
  const img = new window.Image();
  img.src = url;
  await img.decode().catch(() => undefined);
  if (!img.naturalWidth) return url;
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && url.length < 1_500_000 && TYPES.test(url)) return url;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.75);
}

/** Make sure an image is a type and size the server takes. */
async function finish(url: string): Promise<ImageResult> {
  const out = await shrinkOnWeb(url);
  if (!TYPES.test(out)) return { error: 'That image type isn’t supported. Use a JPEG, PNG, WebP or GIF.' };
  if (out.length > MAX_IMAGE_CHARS) return { error: 'That image is too large. Try a smaller one or crop it.' };
  return { image: out };
}

/** Take a photo, or pick one from the library. Null when cancelled. */
export async function pickImage(camera: boolean): Promise<ImageResult> {
  const native = Platform.OS !== 'web';
  if (camera && native) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { error: 'Camera access is off for Forkbell. You can turn it on in Settings.' };
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.45, base64: true };
  const r = camera && native ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const url = a.base64 ? `data:${a.mimeType?.startsWith('image/') ? a.mimeType : 'image/jpeg'};base64,${a.base64}` : a.uri.startsWith('data:') ? a.uri : null;
  return url ? finish(url) : { error: 'Couldn’t read that photo.' };
}

/** Whether there's an image on the clipboard (checking doesn't show the paste prompt). */
export async function clipboardHasImage(): Promise<boolean> {
  if (Platform.OS === 'web') return false; // the web uses the normal paste shortcut instead
  try {
    return await Clipboard.hasImageAsync();
  } catch {
    return false;
  }
}

/** The image on the clipboard, as a JPEG. */
export async function pasteImage(): Promise<ImageResult> {
  try {
    const img = await Clipboard.getImageAsync({ format: 'jpeg', jpegQuality: 0.6 });
    return img ? finish(img.data) : { error: 'There’s no image on the clipboard.' };
  } catch {
    return { error: 'Couldn’t paste that image.' };
  }
}

/** An image pasted on the web (Ctrl/Cmd+V), from the paste event. */
export async function imageFromPasteEvent(e: ClipboardEvent): Promise<ImageResult> {
  const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
  const file = item?.getAsFile();
  return file ? finish(await blobToDataUrl(file)) : null;
}

/**
 * Load an image from a link. Phones can fetch any link; a browser only can
 * when the other site allows it, so the web often has to ask for the image
 * itself. The server never fetches links for you (so a link can't be used to
 * reach things on your home network).
 */
export async function imageFromLink(url: string): Promise<ImageResult> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    return {
      error:
        Platform.OS === 'web'
          ? 'That site doesn’t let browsers load its images directly. Copy the image itself (right-click, Copy image) and paste it, or save it and attach it.'
          : 'Couldn’t load that image link.',
    };
  }
  if (!res.ok) return { error: `That link answered ${res.status}.` };
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) return { error: 'That link isn’t an image.' };
  if (blob.size > 12_000_000) return { error: 'That image is too large.' };
  return finish(await blobToDataUrl(blob));
}
