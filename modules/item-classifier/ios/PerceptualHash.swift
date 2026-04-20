import Accelerate
import CoreGraphics
import UIKit

/// Perceptual hashing using DCT for image similarity matching.
enum PerceptualHash {
  private static let hashSize = 32 // resize target
  private static let lowFreq = 8   // 8×8 low-frequency block

  /// Compute a 64-bit perceptual hash from a CGImage.
  static func compute(from cgImage: CGImage) -> UInt64 {
    // Convert to 32×32 grayscale
    let size = hashSize
    let grayscale = toGrayscale(cgImage, size: size)

    // 2D DCT via Accelerate
    let dctResult = dct2d(grayscale, size: size)

    // Extract 8×8 low-frequency block (skip DC at [0,0])
    var lowFreqValues: [Float] = []
    lowFreqValues.reserveCapacity(lowFreq * lowFreq - 1)
    for r in 0..<lowFreq {
      for c in 0..<lowFreq {
        if r == 0 && c == 0 { continue }
        lowFreqValues.append(dctResult[r * size + c])
      }
    }

    // Median threshold
    let sorted = lowFreqValues.sorted()
    let median = sorted[sorted.count / 2]

    // Build 64-bit hash
    var hash: UInt64 = 0
    for i in 0..<min(64, lowFreqValues.count) {
      if lowFreqValues[i] > median {
        hash |= (1 << i)
      }
    }

    return hash
  }

  /// Hamming distance between two hashes (number of differing bits).
  static func hammingDistance(_ a: UInt64, _ b: UInt64) -> Int {
    return (a ^ b).nonzeroBitCount
  }

  // MARK: - Private

  private static func toGrayscale(_ image: CGImage, size: Int) -> [Float] {
    let colorSpace = CGColorSpaceCreateDeviceGray()
    var pixels = [UInt8](repeating: 0, count: size * size)

    guard let context = CGContext(
      data: &pixels,
      width: size,
      height: size,
      bitsPerComponent: 8,
      bytesPerRow: size,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else {
      return [Float](repeating: 0, count: size * size)
    }

    context.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))

    return pixels.map { Float($0) }
  }

  private static func dct2d(_ input: [Float], size: Int) -> [Float] {
    var result = [Float](repeating: 0, count: size * size)

    // DCT on rows
    var rowDCT = [Float](repeating: 0, count: size * size)
    for r in 0..<size {
      var row = Array(input[(r * size)..<((r + 1) * size)])
      var output = [Float](repeating: 0, count: size)

      let setup = vDSP_DCT_CreateSetup(nil, vDSP_Length(size), .II)!
      vDSP_DCT_Execute(setup, &row, &output)
      vDSP_DFT_DestroySetup(setup)

      for c in 0..<size {
        rowDCT[r * size + c] = output[c]
      }
    }

    // DCT on columns
    for c in 0..<size {
      var col = [Float](repeating: 0, count: size)
      for r in 0..<size {
        col[r] = rowDCT[r * size + c]
      }
      var output = [Float](repeating: 0, count: size)

      let setup = vDSP_DCT_CreateSetup(nil, vDSP_Length(size), .II)!
      vDSP_DCT_Execute(setup, &col, &output)
      vDSP_DFT_DestroySetup(setup)

      for r in 0..<size {
        result[r * size + c] = output[r]
      }
    }

    return result
  }
}
