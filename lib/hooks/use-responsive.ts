import { useWindowDimensions } from "react-native";

/** Breakpoint above which we consider the device a tablet. */
const TABLET_MIN_WIDTH = 700;

/** Base phone width used as the scaling reference. */
const PHONE_BASE_WIDTH = 390;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;

  // Scale factor relative to a standard phone width, capped at 1.6x
  const scale = isTablet ? Math.min(width / PHONE_BASE_WIDTH, 1.6) : 1;

  return {
    width,
    height,
    isTablet,
    scale,

    // Grid columns for list/grid views
    gridColumns: isTablet ? 4 : 2,

    // Bottom sheet max width
    sheetMaxWidth: isTablet ? 500 : undefined,
  };
}
