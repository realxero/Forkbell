// The LiDAR camera, from JavaScript. Only on iPhones and iPads with LiDAR, and
// only in a build that includes this module; everywhere else lidarSupported is
// false and nothing here is ever called.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { base64ToBytes, type DepthScan } from '@forkbell/shared';

type Raw = {
  image: string;
  imageWidth: number;
  imageHeight: number;
  depth: string;
  confidence?: string;
  width: number;
  height: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
};
type Native = { isSupported(): boolean; capture(): Promise<Raw | null> };

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('ForkbellDepth') : null;

export const lidarSupported = (() => {
  try {
    return Boolean(native?.isSupported());
  } catch {
    return false;
  }
})();

/**
 * Why the LiDAR option is or isn't there: 'ready'; 'no-lidar' (this iPhone has
 * none); 'not-in-build' (an iPhone build made without the native module, which
 * is worth saying, because it looks just like a phone with no LiDAR); 'other'.
 */
export const lidarStatus: 'ready' | 'no-lidar' | 'not-in-build' | 'other' =
  Platform.OS !== 'ios' ? 'other' : !native ? 'not-in-build' : lidarSupported ? 'ready' : 'no-lidar';

export type PlateCapture = DepthScan & { image: string; imageWidth: number; imageHeight: number };

/** Open the LiDAR camera and take one measurement. Null if you cancelled. */
export async function capturePlate(): Promise<PlateCapture | null> {
  if (!native) throw new Error('Measuring with LiDAR needs the Forkbell app on an iPhone Pro.');
  const raw = await native.capture();
  if (!raw) return null;
  const depthBytes = base64ToBytes(raw.depth);
  return {
    image: raw.image,
    imageWidth: raw.imageWidth,
    imageHeight: raw.imageHeight,
    width: raw.width,
    height: raw.height,
    depth: new Float32Array(depthBytes.buffer, depthBytes.byteOffset, Math.floor(depthBytes.byteLength / 4)),
    confidence: raw.confidence ? base64ToBytes(raw.confidence) : null,
    fx: raw.fx,
    fy: raw.fy,
    cx: raw.cx,
    cy: raw.cy,
  };
}
