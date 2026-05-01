import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/lib/theme";
import { SearchX } from "lucide-react-native";
import { View } from "react-native";

interface SearchEmptyProps {
	query: string;
}

export function SearchEmpty({ query }: SearchEmptyProps) {
	const theme = useThemeColors();

	return (
		<View className="items-center justify-center py-16 px-8">
			<SearchX size={40} color={theme.mutedForeground} strokeWidth={1.5} />
			<Text className="text-base font-semibold mt-4">No results</Text>
			<Text className="text-muted-foreground text-sm text-center mt-1">
				Nothing matched "{query}"
			</Text>
		</View>
	);
}
