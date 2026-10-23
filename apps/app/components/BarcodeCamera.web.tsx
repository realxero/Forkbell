import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { color, space, type } from '../lib/theme';
import type { BarcodeCameraProps } from './BarcodeCamera';

/**
 * Browser version, for the web app and iPhone home-screen app. Safari has no
 * built-in barcode reader, so frames from the camera are decoded in JavaScript.
 * Only food barcode formats are tried, which keeps it quick.
 */
export function BarcodeCamera({ onCode, onError }: BarcodeCameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [starting, setStarting] = useState(true);
  // Keep the latest callbacks without restarting the camera when they change.
  const cb = useRef({ onCode, onError });
  cb.current = { onCode, onError };

  useEffect(() => {
    const { onError } = cb.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      onError('This browser can’t use the camera here. Camera access needs the https address. Type the number below instead.');
      return;
    }
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
    let controls: IScannerControls | null = null;
    let cancelled = false;
    let done = false;

    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current!, (result, _err, c) => {
        if (!result || done) return;
        done = true;
        c.stop();
        cb.current.onCode(result.getText());
      })
      .then((c) => {
        controls = c;
        setStarting(false);
        if (cancelled) c.stop();
      })
      .catch((e: unknown) => {
        const name = e instanceof Error ? e.name : '';
        onError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it for this site in your browser settings, or type the number below.'
            : name === 'NotFoundError'
              ? 'No camera found. Type the number below instead.'
              : 'The camera didn’t start. Type the number below instead.',
        );
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <View style={s.frame}>
      <video ref={video} muted playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <View style={s.target} pointerEvents="none" />
      {starting && (
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <Text style={[type.small, { color: color.chalk }]}>Starting camera…</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, maxHeight: 480, borderRadius: 16, overflow: 'hidden', backgroundColor: color.iron },
  center: { alignItems: 'center', justifyContent: 'center', padding: space(4) },
  target: { position: 'absolute', left: '12%', right: '12%', top: '38%', height: '24%', borderWidth: 3, borderColor: color.chalk, borderRadius: 12 },
});
