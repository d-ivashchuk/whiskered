import { requireNativeModule } from "expo-modules-core";

export type ClassificationResult = {
  label: string;
  confidence: number;
  top3: Array<{ label: string; confidence: number }>;
};

export type MatchResult = {
  topLabel: string;
  results: Array<{ label: string; score: number }>;
};

export default requireNativeModule<{
  classifyImage(uri: string): Promise<ClassificationResult>;
  matchSprite(uri: string): Promise<MatchResult>;
}>("ItemClassifier");
