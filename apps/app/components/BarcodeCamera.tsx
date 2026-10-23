import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { color, space, type } from '../lib/theme';

export type BarcodeCameraProps = {
  onCode: (code: string) => void;
  onError: (message: string) => void;
};

/** Live camera that reports the first food barcode it sees (iPhone and Android). */
export function BarcodeCamera({ onCode, onError }: BarcodeCameraProps) {
  const [permission, request] = useCameraPermissions();
  const done = useRef(false);
  const cb = useRef({ onCode, onError });
  cb.current = { onCode, onError };

  useEffect(() => {
    if (permission && !permission.granted) {
      if (permission.canAskAgain) request();
      else cb.current.onError('Camera access is off for Forkbell. Turn it on in Settings, or type the number below.');
    }
  }, [permission, request]);

  if (!permission?.granted) {
    return (
      <View style={[s.frame, s.center]}>
        <Text style={[type.small, { color: color.chalk }]}>Waiting for camera access…</Text>
      </View>
    );
  }
  return (
    <View style={s.frame}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          done.current = true;
          cb.current.onCode(data);
        }}
      />
      <View style={s.target} pointerEvents="none" />
    </View>
  );
}

const s = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, maxHeight: 480, borderRadius: 16, overflow: 'hidden', backgroundColor: color.iron },
  center: { alignItems: 'center', justifyContent: 'center', padding: space(4) },
  target: { position: 'absolute', left: '12%', right: '12%', top: '38%', height: '24%', borderWidth: 3, borderColor: color.chalk, borderRadius: 12 },
});
