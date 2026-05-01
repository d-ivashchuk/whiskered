import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Defs, Pattern, Path, Rect } from "react-native-svg";

interface PaperGridProps {
	/** Cell size in px. */
	size?: number;
	/** Stroke color for the grid lines. */
	stroke?: string;
	/** Background fill of the paper. */
	fill?: string;
}

/**
 * Cream/yellow paper background with a faint orthogonal grid — the visual
 * stage for every onboarding step. Renders absolute fullscreen behind content.
 */
export function PaperGrid({
	size = 36,
	stroke = "#E8B45A",
	fill = "#F8DC8E",
}: PaperGridProps) {
	const patternId = useMemo(
		() => `paper-grid-${Math.random().toString(36).slice(2, 8)}`,
		[],
	);

	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: fill,
			}}
		>
			<Svg width="100%" height="100%">
				<Defs>
					<Pattern
						id={patternId}
						x="0"
						y="0"
						width={size}
						height={size}
						patternUnits="userSpaceOnUse"
					>
						<Path
							d={`M ${size} 0 L 0 0 0 ${size}`}
							fill="none"
							stroke={stroke}
							strokeWidth={1}
							opacity={0.35}
						/>
					</Pattern>
				</Defs>
				<Rect width="100%" height="100%" fill={`url(#${patternId})`} />
			</Svg>
		</View>
	);
}
