import Vision
import UIKit

/// Pre-computes and caches Apple Vision feature prints for all reference sprites.
/// On first launch, computes all 1,044 prints and saves to disk (~30s one-time cost).
/// On subsequent launches, loads from cache instantly.
/// At query time: 1 feature print computation + 1,044 vector comparisons ≈ 25ms total.
final class FeaturePrintMatcher {
  static let shared = FeaturePrintMatcher()

  /// All pre-computed reference feature prints, keyed by label.
  private var cachedPrints: [String: VNFeaturePrintObservation] = [:]
  private(set) var isPrepared = false
  private(set) var preparationProgress: Float = 0
  private let lock = NSLock()

  private var cacheFileURL: URL {
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
    return caches.appendingPathComponent("sprite-feature-prints-v1.cache")
  }

  private init() {}

  /// Pre-compute feature prints for all sprites. Call on a background thread.
  /// Tries to load from disk cache first; if missing, computes from sprite PNGs.
  func prepareAll(labels: [String]) {
    guard !isPrepared else { return }

    // Try loading from disk cache first
    if loadFromDisk(expectedCount: labels.count) {
      print("[FeaturePrintMatcher] Loaded \(cachedPrints.count) feature prints from cache")
      return
    }

    print("[FeaturePrintMatcher] Computing feature prints for \(labels.count) sprites...")
    let startTime = CFAbsoluteTimeGetCurrent()

    var computed: [String: VNFeaturePrintObservation] = [:]
    computed.reserveCapacity(labels.count)

    for (index, label) in labels.enumerated() {
      autoreleasepool {
        if let print = computeReferenceFeaturePrint(for: label) {
          computed[label] = print
        }
      }

      if index % 50 == 0 {
        lock.lock()
        preparationProgress = Float(index) / Float(labels.count)
        lock.unlock()
      }
    }

    lock.lock()
    cachedPrints = computed
    isPrepared = true
    preparationProgress = 1.0
    lock.unlock()

    let elapsed = CFAbsoluteTimeGetCurrent() - startTime
    print("[FeaturePrintMatcher] Computed \(computed.count) feature prints in \(String(format: "%.1f", elapsed))s")

    // Save to disk for next launch
    saveToDisk()
  }

  /// Compute a feature print for a query CGImage.
  func computeFeaturePrint(for cgImage: CGImage) -> VNFeaturePrintObservation? {
    let request = VNGenerateImageFeaturePrintRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
      try handler.perform([request])
      return request.results?.first as? VNFeaturePrintObservation
    } catch {
      print("[FeaturePrintMatcher] Failed to compute feature print: \(error)")
      return nil
    }
  }

  /// Rank ALL pre-computed references by distance to a query feature print.
  /// Returns labels sorted by ascending distance (most similar first).
  func rankAll(query: VNFeaturePrintObservation) -> [(label: String, distance: Float)] {
    lock.lock()
    let prints = cachedPrints
    lock.unlock()

    var results: [(label: String, distance: Float)] = []
    results.reserveCapacity(prints.count)

    for (label, refPrint) in prints {
      var dist: Float = 0
      do {
        try query.computeDistance(&dist, to: refPrint)
        results.append((label: label, distance: dist))
      } catch {
        continue
      }
    }

    results.sort { $0.distance < $1.distance }
    return results
  }

  /// Get a single cached feature print (for filtered candidate matching).
  func cachedFeaturePrint(for label: String) -> VNFeaturePrintObservation? {
    lock.lock()
    let print = cachedPrints[label]
    lock.unlock()
    return print
  }

  // MARK: - Disk Cache

  private func saveToDisk() {
    do {
      let data = try NSKeyedArchiver.archivedData(
        withRootObject: cachedPrints as NSDictionary,
        requiringSecureCoding: true
      )
      try data.write(to: cacheFileURL, options: .atomic)
      print("[FeaturePrintMatcher] Saved cache to disk (\(data.count / 1024) KB)")
    } catch {
      print("[FeaturePrintMatcher] Failed to save cache: \(error)")
    }
  }

  private func loadFromDisk(expectedCount: Int) -> Bool {
    guard FileManager.default.fileExists(atPath: cacheFileURL.path) else {
      return false
    }

    do {
      let data = try Data(contentsOf: cacheFileURL)
      let allowedClasses: [AnyClass] = [
        NSDictionary.self,
        NSString.self,
        VNFeaturePrintObservation.self,
      ]
      guard let dict = try NSKeyedUnarchiver.unarchivedObject(
        ofClasses: allowedClasses,
        from: data
      ) as? [String: VNFeaturePrintObservation] else {
        return false
      }

      // Only use cache if it has enough entries (in case sprites were added)
      guard dict.count >= expectedCount - 10 else {
        print("[FeaturePrintMatcher] Cache stale (\(dict.count) vs \(expectedCount) expected)")
        return false
      }

      lock.lock()
      cachedPrints = dict
      isPrepared = true
      preparationProgress = 1.0
      lock.unlock()
      return true
    } catch {
      print("[FeaturePrintMatcher] Failed to load cache: \(error)")
      return false
    }
  }

  // MARK: - Private

  private func computeReferenceFeaturePrint(for label: String) -> VNFeaturePrintObservation? {
    guard let url = Bundle.main.url(
      forResource: label,
      withExtension: "png",
      subdirectory: "SpriteAssets"
    ) else {
      return nil
    }

    guard let data = try? Data(contentsOf: url),
          let image = UIImage(data: data),
          let cgImage = image.cgImage else {
      return nil
    }

    return computeFeaturePrint(for: cgImage)
  }
}
