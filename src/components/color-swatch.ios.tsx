import { ColorPicker, Host } from '@expo/ui/swift-ui';
import { View } from 'react-native';

export function ColorSwatch({
  color,
  label,
  onChange,
}: {
  color: string;
  label: string;
  onChange: (color: string) => void;
}) {
  // A ColorPicker without a label draws only its swatch, which opens the system picker.
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="button">
      <Host style={{ width: 36, height: 36 }}>
        <ColorPicker selection={color} onSelectionChange={onChange} supportsOpacity />
      </Host>
    </View>
  );
}
