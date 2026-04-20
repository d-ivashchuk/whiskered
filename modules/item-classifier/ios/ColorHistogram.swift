import CoreGraphics
import UIKit

/// HSV color histogram computation and comparison.
enum ColorHistogram {
  static let hBins = 16
  static let sBins = 2
  static let vBins = 2
  static let totalBins = hBins * sBins * vBins // 64

  // Background mask thresholds
  private static let bgSatMax: Float = 0.08
  private static let bgValMin: Float = 0.7

  /// Compute a 64-bin HSV histogram from a CGImage, masking gray background pixels.
  static func compute(from cgImage: CGImage) -> [Float] {
    let size = 64 // downsample for speed
    let pixels = toRGBA(cgImage, size: size)
    let pixelCount = size * size

    var histogram = [Float](repeating: 0, count: totalBins)
    var validPixels: Float = 0

    for i in 0..<pixelCount {
      let offset = i * 4
      let r = Float(pixels[offset]) / 255.0
      let g = Float(pixels[offset + 1]) / 255.0
      let b = Float(pixels[offset + 2]) / 255.0

      let (h, s, v) = rgbToHSV(r: r, g: g, b: b)

      // Skip background pixels
      if s < bgSatMax && v > bgValMin { continue }

      let hBin = min(Int((h / 360.0) * Float(hBins)), hBins - 1)
      let sBin = min(Int(s * Float(sBins)), sBins - 1)
      let vBin = min(Int(v * Float(vBins)), vBins - 1)

      let bin = hBin * sBins * vBins + sBin * vBins + vBin
      histogram[bin] += 1
      validPixels += 1
    }

    // Normalize
    if validPixels > 0 {
      for i in 0..<totalBins {
        histogram[i] /= validPixels
      }
    }

    return histogram
  }

  /// Chi-squared distance between two histograms. Lower = more similar.
  static func chiSquaredDistance(_ a: [Float], _ b: [Float]) -> Float {
    var distance: Float = 0
    for i in 0..<min(a.count, b.count) {
      let sum = a[i] + b[i]
      if sum > 0 {
        let diff = a[i] - b[i]
        distance += (diff * diff) / sum
      }
    }
    return distance * 0.5
  }

  // MARK: - Private

  private static func toRGBA(_ image: CGImage, size: Int) -> [UInt8] {
    var pixels = [UInt8](repeating: 0, count: size * size * 4)
    let colorSpace = CGColorSpaceCreateDeviceRGB()

    guard let context = CGContext(
      data: &pixels,
      width: size,
      height: size,
      bitsPerComponent: 8,
      bytesPerRow: size * 4,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      return pixels
    }

    context.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
    return pixels
  }

  private static func rgbToHSV(r: Float, g: Float, b: Float) -> (h: Float, s: Float, v: Float) {
    let maxVal = max(r, g, b)
    let minVal = min(r, g, b)
    let delta = maxVal - minVal

    var h: Float = 0
    if delta > 0 {
      if maxVal == r {
        h = 60.0 * fmod((g - b) / delta, 6.0)
      } else if maxVal == g {
        h = 60.0 * ((b - r) / delta + 2.0)
      } else {
        h = 60.0 * ((r - g) / delta + 4.0)
      }
      if h < 0 { h += 360.0 }
    }

    let s = maxVal == 0 ? 0 : delta / maxVal
    return (h, s, maxVal)
  }
}
