// Inside a sheet with a text box: moves the sheet up with the keyboard on
// iPhone, so what you're typing stays in view.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

export function KeyboardLift({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      {children}
    </KeyboardAvoidingView>
  );
}
