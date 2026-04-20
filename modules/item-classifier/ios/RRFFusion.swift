import Foundation

/// Reciprocal Rank Fusion (RRF) for combining multiple ranked result lists.
enum RRFFusion {
  /// RRF constant k — lower values make top ranks stand out more.
  private static let k: Float = 20.0

  /// Signal weights for each ranking source.
  struct Weights {
    let pHash: Float
    let histogram: Float
    let vision: Float
    let coreML: Float

    // Vision is the dominant signal — it handles screen photos, blur, glare, color shifts.
    // pHash/histogram are structural tiebreakers.
    // CoreML has broken confidences, so it's a weak signal.
    static let `default` = Weights(pHash: 0.8, histogram: 0.8, vision: 3.0, coreML: 0.5)
  }

  /// A single ranked item from one signal source.
  struct RankedItem {
    let label: String
    let rank: Int // 0-based
  }

  /// Fuse multiple ranked lists into a single scored result.
  /// Returns items sorted by descending RRF score, normalized so top = 1.0.
  static func fuse(
    pHashRanks: [RankedItem],
    histogramRanks: [RankedItem],
    visionRanks: [RankedItem],
    coreMLRanks: [RankedItem],
    weights: Weights = .default,
    topK: Int = 16
  ) -> [(label: String, score: Float)] {
    var scores: [String: Float] = [:]

    for item in pHashRanks {
      let rrfScore = weights.pHash / (k + Float(item.rank + 1))
      scores[item.label, default: 0] += rrfScore
    }

    for item in histogramRanks {
      let rrfScore = weights.histogram / (k + Float(item.rank + 1))
      scores[item.label, default: 0] += rrfScore
    }

    for item in visionRanks {
      let rrfScore = weights.vision / (k + Float(item.rank + 1))
      scores[item.label, default: 0] += rrfScore
    }

    for item in coreMLRanks {
      let rrfScore = weights.coreML / (k + Float(item.rank + 1))
      scores[item.label, default: 0] += rrfScore
    }

    var sorted = scores.map { (label: $0.key, score: $0.value) }
      .sorted { $0.score > $1.score }

    // Normalize so top score = 1.0
    if let maxScore = sorted.first?.score, maxScore > 0 {
      sorted = sorted.map { (label: $0.label, score: $0.score / maxScore) }
    }

    return Array(sorted.prefix(topK))
  }
}
