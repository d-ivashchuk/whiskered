import Foundation

/// A single reference sprite entry loaded from the binary fingerprint file.
struct SpriteReference {
  let label: String
  let pHash: UInt64
  let histogram: [Float] // 64 bins
}

/// Loads and stores the precomputed sprite fingerprints from the bundled binary file.
final class ReferenceStore {
  static let shared = ReferenceStore()

  private(set) var references: [SpriteReference] = []
  private(set) var isLoaded = false

  private init() {}

  /// Load fingerprints from the bundled binary file.
  /// Binary format: [4B magic][4B version][4B count][4B reserved]
  /// Per entry: [8B pHash][256B histogram (64×f32)][1B labelLen][NB label]
  func load() {
    guard !isLoaded else { return }

    guard let url = Bundle.main.url(forResource: "sprite-fingerprints", withExtension: "bin") else {
      print("[ReferenceStore] sprite-fingerprints.bin not found in bundle")
      return
    }

    guard let data = try? Data(contentsOf: url) else {
      print("[ReferenceStore] Failed to read sprite-fingerprints.bin")
      return
    }

    guard data.count >= 16 else {
      print("[ReferenceStore] File too small")
      return
    }

    // Validate magic
    let magic = String(data: data[0..<4], encoding: .ascii)
    guard magic == "MWFP" else {
      print("[ReferenceStore] Invalid magic: \(magic ?? "nil")")
      return
    }

    let version = readUInt32(data, offset: 4)
    guard version == 1 else {
      print("[ReferenceStore] Unsupported version: \(version)")
      return
    }

    let count = Int(readUInt32(data, offset: 8))

    var entries: [SpriteReference] = []
    entries.reserveCapacity(count)

    var offset = 16 // skip header

    for _ in 0..<count {
      guard offset + 8 + 256 + 1 <= data.count else { break }

      // pHash (8 bytes, UInt64 LE) — use memcpy for safe unaligned read
      let pHash = readUInt64(data, offset: offset)
      offset += 8

      // Histogram (64 × Float32 = 256 bytes)
      var histogram = [Float](repeating: 0, count: 64)
      for i in 0..<64 {
        histogram[i] = readFloat32(data, offset: offset + i * 4)
      }
      offset += 256

      // Label length (1 byte) + label (UTF-8)
      let labelLen = Int(data[offset])
      offset += 1

      guard offset + labelLen <= data.count else { break }
      let label = String(data: data[offset..<(offset + labelLen)], encoding: .utf8) ?? ""
      offset += labelLen

      entries.append(SpriteReference(label: label, pHash: pHash, histogram: histogram))
    }

    self.references = entries
    self.isLoaded = true
    print("[ReferenceStore] Loaded \(entries.count) sprite fingerprints")
  }

  // MARK: - Safe unaligned reads via memcpy

  private func readUInt32(_ data: Data, offset: Int) -> UInt32 {
    var value: UInt32 = 0
    _ = data.withUnsafeBytes { ptr in
      memcpy(&value, ptr.baseAddress!.advanced(by: offset), 4)
    }
    return value
  }

  private func readUInt64(_ data: Data, offset: Int) -> UInt64 {
    var value: UInt64 = 0
    _ = data.withUnsafeBytes { ptr in
      memcpy(&value, ptr.baseAddress!.advanced(by: offset), 8)
    }
    return value
  }

  private func readFloat32(_ data: Data, offset: Int) -> Float {
    var value: Float = 0
    _ = data.withUnsafeBytes { ptr in
      memcpy(&value, ptr.baseAddress!.advanced(by: offset), 4)
    }
    return value
  }
}
