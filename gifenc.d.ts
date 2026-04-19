declare module "gifenc" {
	interface WriteFrameOptions {
		palette: number[][];
		delay?: number;
		dispose?: number;
		transparent?: boolean;
		transparentIndex?: number;
	}

	interface Encoder {
		writeFrame(
			index: Uint8Array,
			width: number,
			height: number,
			options: WriteFrameOptions,
		): void;
		finish(): void;
		bytes(): Uint8Array;
		bytesView(): Uint8Array;
	}

	export function GIFEncoder(): Encoder;
	export function quantize(
		rgba: Uint8Array,
		maxColors: number,
		options?: { format?: string; oneBitAlpha?: boolean | number },
	): number[][];
	export function applyPalette(
		rgba: Uint8Array,
		palette: number[][],
		format?: string,
	): Uint8Array;
	export function nearestColorIndex(
		palette: number[][],
		pixel: number[],
	): number;
	export function nearestColor(
		palette: number[][],
		pixel: number[],
	): number[];
	export function nearestColorIndexWithDistance(
		palette: number[][],
		pixel: number[],
	): [number, number];
	export function prequantize(
		rgba: Uint8Array,
		options?: { roundRGB?: number; roundAlpha?: number; oneBitAlpha?: boolean | number },
	): void;
	export function snapColorsToPalette(
		palette: number[][],
		knownColors: number[][],
		threshold?: number,
	): void;
}
