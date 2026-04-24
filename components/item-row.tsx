import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { getTierColor } from "@/lib/game-colors";
import { getItemSprite, getSlotSprite } from "@/lib/sprites";
import { Image, Pressable, View } from "react-native";

export interface ItemRowData {
  name: string;
  internalName?: string;
  slot?: string;
  rarity?: string;
  tier?: string;
  /** Optional subtitle override — if not given, rarity is shown */
  subtitle?: string;
}

/**
 * Standardised item row used across item lists, set details, effect details,
 * and related-items sections. Shows: [TierBadge] [Sprite] [Name+subtitle] [SlotIcon].
 */
export function ItemRow({
  item,
  onPress,
}: {
  item: ItemRowData;
  onPress: () => void;
}) {
  const theme = useThemeColors();
  const sprite = getItemSprite(item.name, item.internalName);
  const tierColor = item.tier ? getTierColor(item.tier) : null;
  const slotSprite = item.slot ? getSlotSprite(item.slot) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.secondary : "transparent",
      })}
      className="flex-row items-center py-2.5 border-b border-border"
    >
      {/* Tier badge */}
      {tierColor ? (
        <View
          style={{ backgroundColor: tierColor.bg }}
          className="w-6 h-6 items-center justify-center rounded mr-2"
        >
          <Text style={{ color: tierColor.text }} className="text-xs font-black">
            {item.tier}
          </Text>
        </View>
      ) : (
        <View className="w-6 mr-2" />
      )}

      {/* Sprite */}
      <View className="w-8 h-8 mr-2.5 items-center justify-center">
        {sprite ? (
          <Image source={sprite} style={{ width: 28, height: 28 }} resizeMode="contain" />
        ) : (
          <View
            style={{ backgroundColor: theme.secondary }}
            className="w-7 h-7 rounded items-center justify-center"
          >
            <Text className="text-muted-foreground text-[10px]">?</Text>
          </View>
        )}
      </View>

      {/* Name + subtitle */}
      <View className="flex-1 mr-2">
        <Text className="text-sm font-medium" numberOfLines={1}>
          {item.name}
        </Text>
        {item.subtitle ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : item.rarity ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {item.rarity}
          </Text>
        ) : null}
      </View>

      {/* Slot icon */}
      {slotSprite ? (
        <Image source={slotSprite} style={{ width: 18, height: 18, opacity: 0.5 }} resizeMode="contain" />
      ) : item.slot ? (
        <Text className="text-muted-foreground text-xs">{item.slot}</Text>
      ) : null}
    </Pressable>
  );
}
