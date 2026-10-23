import { useEffect, useRef, useState } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

/**
 * A number box that keeps what you type ("12." or "") while you type, and
 * reports the value when you leave it. Updates from outside (a filled-in
 * suggestion, a copied set) show up whenever you're not typing in it.
 */
export function NumberField({
  value,
  onCommit,
  placeholder,
  style,
  decimal = true,
  label,
}: {
  value: string;
  onCommit: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  decimal?: boolean;
  label: string;
}) {
  const [text, setText] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(value);
  }, [value]);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onFocus={() => (editing.current = true)}
      onBlur={() => {
        editing.current = false;
        if (text !== value) onCommit(text);
      }}
      onSubmitEditing={() => onCommit(text)}
      placeholder={placeholder}
      placeholderTextColor="#A3ACB1"
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      style={style}
      accessibilityLabel={label}
      returnKeyType="done"
    />
  );
}
