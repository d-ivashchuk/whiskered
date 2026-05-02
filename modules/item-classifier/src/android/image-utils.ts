/**
 * Image utility functions for the Android scanner pipeline.
 *
 * Provides JPEG decoding, resizing, and ImageNet normalization
 * using expo-image-manipulator + jpeg-js (pure JS).
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { decode as decodeJpeg } from "jpeg-js";
import { Buffer } from "buffer";

/** RGBA pixel data from a decoded image. */
export interface PixelData {
  width: number;
  height: number;
  /** RGBA interleaved, length = width * height * 4 */
  data: Uint8Array;
}

/** ImageNet normalization constants. */
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

/**
 * Resize an image and decode it to RGBA pixels.
 * Uses expo-image-manipulator for GPU-accelerated resize,
 * then jpeg-js for pure-JS pixel extraction.
 */
export async function getPixels(
  uri: string,
  width: number,
  height: number
): Promise<PixelData> {
  // Resize via native module (fast, GPU)
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width, height } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
  );

  // Read the resized JPEG as base64
  const base64 = await FileSystem.readAsStringAsync(result.uri, {
    encoding: "base64",
  });

  // Decode JPEG to RGBA pixel buffer
  const jpegBuffer = Buffer.from(base64, "base64");
  const decoded = decodeJpeg(jpegBuffer, {
    useTArray: true,
    formatAsRGBA: true,
  });

  return {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data as Uint8Array,
  };
}

/**
 * Convert RGBA pixels to NHWC float32 tensor with ImageNet normalization.
 * Output shape: [1, height, width, 3] — TFLite convention (onnx2tf converts to NHWC).
 */
export function pixelsToTensor(pixels: PixelData): Float32Array {
  const { width, height, data } = pixels;
  const tensorSize = 3 * height * width;
  const tensor = new Float32Array(tensorSize);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = (y * width + x) * 4; // RGBA
      const r = data[pixelIdx] / 255.0;
      const g = data[pixelIdx + 1] / 255.0;
      const b = data[pixelIdx + 2] / 255.0;

      // NHWC layout: [y][x][R, G, B]
      const outIdx = (y * width + x) * 3;

      tensor[outIdx] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      tensor[outIdx + 1] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      tensor[outIdx + 2] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    }
  }

  return tensor;
}

/**
 * Convert an image URI to a normalized NHWC tensor ready for TFLite inference.
 * Convenience wrapper around getPixels + pixelsToTensor.
 */
export async function imageToTensor(
  uri: string,
  size: number = 224
): Promise<Float32Array> {
  const pixels = await getPixels(uri, size, size);
  return pixelsToTensor(pixels);
}
