export function updateInferenceEma(previousMs: number, sampleMs: number): number {
  return previousMs * 0.9 + sampleMs * 0.1
}
