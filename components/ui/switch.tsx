import { triggerImpact } from "@/lib/haptics";
import { useThemeColors } from "@/lib/theme";
import { useCallback } from "react";
import { Switch as RNSwitch } from "react-native";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Switch({ checked, onCheckedChange, disabled }: SwitchProps) {
  const colors = useThemeColors();

  const handleChange = useCallback(
    (value: boolean) => {
      triggerImpact();
      onCheckedChange(value);
    },
    [onCheckedChange],
  );

  return (
    <RNSwitch
      value={checked}
      onValueChange={handleChange}
      disabled={disabled}
      trackColor={{ false: colors.switchTrack, true: colors.switchActive }}
    />
  );
}

export { Switch };
