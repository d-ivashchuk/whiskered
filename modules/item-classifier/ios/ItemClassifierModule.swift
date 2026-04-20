import ExpoModulesCore
import CoreML
import Vision
import UIKit

public class ItemClassifierModule: Module {
  private var model: VNCoreMLModel?

  public func definition() -> ModuleDefinition {
    Name("ItemClassifier")

    OnCreate {
      self.loadModel()
      DispatchQueue.global(qos: .utility).async {
        ReferenceStore.shared.load()
        // Pre-compute all Vision feature prints (cached to disk after first run)
        let labels = ReferenceStore.shared.references.map { $0.label }
        FeaturePrintMatcher.shared.prepareAll(labels: labels)
      }
    }

    AsyncFunction("classifyImage") { (uri: String, promise: Promise) in
      guard let model = self.model else {
        promise.reject("MODEL_NOT_LOADED", "CoreML model is not loaded")
        return
      }

      guard let imageURL = URL(string: uri) else {
        promise.reject("INVALID_URI", "Invalid image URI: \(uri)")
        return
      }

      self.classify(imageURL: imageURL, model: model, promise: promise)
    }

    AsyncFunction("matchSprite") { (uri: String, promise: Promise) in
      guard let imageURL = URL(string: uri) else {
        promise.reject("INVALID_URI", "Invalid image URI: \(uri)")
        return
      }

      self.matchSprite(imageURL: imageURL, promise: promise)
    }
  }

  private func loadModel() {
    guard let modelURL = Bundle.main.url(
      forResource: "mewgenics_items",
      withExtension: "mlmodelc"
    ) else {
      print("[ItemClassifier] Model not found in bundle")
      return
    }

    do {
      let config = MLModelConfiguration()
      config.computeUnits = .all
      let coreMLModel = try MLModel(contentsOf: modelURL, configuration: config)
      self.model = try VNCoreMLModel(for: coreMLModel)
      print("[ItemClassifier] Model loaded successfully")
    } catch {
      print("[ItemClassifier] Failed to load model: \(error)")
    }
  }

  private func classify(imageURL: URL, model: VNCoreMLModel, promise: Promise) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let imageData = try? Data(contentsOf: imageURL),
            let image = UIImage(data: imageData),
            let cgImage = image.cgImage else {
        promise.reject("IMAGE_LOAD_FAILED", "Failed to load image from URI")
        return
      }

      let request = VNCoreMLRequest(model: model) { request, error in
        if let error = error {
          promise.reject("CLASSIFICATION_FAILED", "Classification error: \(error.localizedDescription)")
          return
        }

        guard let results = request.results as? [VNClassificationObservation],
              let top = results.first else {
          promise.reject("NO_RESULTS", "No classification results")
          return
        }

        let top3 = Array(results.prefix(8)).map { observation in
          return [
            "label": observation.identifier,
            "confidence": Double(observation.confidence),
          ] as [String: Any]
        }

        promise.resolve([
          "label": top.identifier,
          "confidence": Double(top.confidence),
          "top3": top3,
        ] as [String: Any])
      }

      request.imageCropAndScaleOption = .centerCrop

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        promise.reject("VISION_FAILED", "Vision request failed: \(error.localizedDescription)")
      }
    }
  }

  // MARK: - Hybrid Matching Pipeline

  private func matchSprite(imageURL: URL, promise: Promise) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let imageData = try? Data(contentsOf: imageURL),
            let image = UIImage(data: imageData),
            let cgImage = image.cgImage else {
        promise.reject("IMAGE_LOAD_FAILED", "Failed to load image from URI")
        return
      }

      let store = ReferenceStore.shared
      guard store.isLoaded, !store.references.isEmpty else {
        promise.reject("REFS_NOT_LOADED", "Sprite fingerprints not loaded")
        return
      }

      let refs = store.references
      let matcher = FeaturePrintMatcher.shared

      // === Signal 1: Vision feature prints (PRIMARY — most accurate for screen photos) ===
      var visionRanked: [RRFFusion.RankedItem] = []

      if matcher.isPrepared, let queryPrint = matcher.computeFeaturePrint(for: cgImage) {
        // Compare against ALL 1,044 sprites — this is the key accuracy improvement.
        // With cached prints, 1,044 distance computations takes <2ms.
        let allDistances = matcher.rankAll(query: queryPrint)
        visionRanked = allDistances.prefix(50).enumerated().map { (rank, item) in
          RRFFusion.RankedItem(label: item.label, rank: rank)
        }
      }

      // === Signal 2: pHash (fast structural similarity) ===
      let queryHash = PerceptualHash.compute(from: cgImage)
      let pHashSorted = refs.map { ref in
        (label: ref.label, distance: PerceptualHash.hammingDistance(queryHash, ref.pHash))
      }.sorted { $0.distance < $1.distance }

      let pHashRanked = pHashSorted.prefix(30).enumerated().map { (rank, item) in
        RRFFusion.RankedItem(label: item.label, rank: rank)
      }

      // === Signal 3: Color histogram ===
      let queryHist = ColorHistogram.compute(from: cgImage)
      let histSorted = refs.map { ref in
        (label: ref.label, distance: ColorHistogram.chiSquaredDistance(queryHist, ref.histogram))
      }.sorted { $0.distance < $1.distance }

      let histRanked = histSorted.prefix(30).enumerated().map { (rank, item) in
        RRFFusion.RankedItem(label: item.label, rank: rank)
      }

      // === Signal 4: CoreML classifier ===
      var coreMLRanked: [RRFFusion.RankedItem] = []
      if let model = self.model {
        let request = VNCoreMLRequest(model: model)
        request.imageCropAndScaleOption = .centerCrop
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

        if let _ = try? handler.perform([request]),
           let results = request.results as? [VNClassificationObservation] {
          coreMLRanked = Array(results.prefix(20)).enumerated().map { (rank, obs) in
            RRFFusion.RankedItem(label: obs.identifier, rank: rank)
          }
        }
      }

      // === RRF Fusion ===
      let fused = RRFFusion.fuse(
        pHashRanks: Array(pHashRanked),
        histogramRanks: Array(histRanked),
        visionRanks: visionRanked,
        coreMLRanks: coreMLRanked,
        topK: 16
      )

      let results = fused.map { item in
        [
          "label": item.label,
          "score": Double(item.score),
        ] as [String: Any]
      }

      let topLabel = fused.first?.label ?? ""

      promise.resolve([
        "topLabel": topLabel,
        "results": results,
      ] as [String: Any])
    }
  }
}
