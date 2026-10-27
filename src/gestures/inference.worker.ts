import type { HandLandmarker } from "@mediapipe/tasks-vision";
// Classic worker is intentional: MediaPipe's WASM loader uses importScripts.
// The pinned ESM API is imported dynamically from the local copied package asset.
let model: HandLandmarker | null = null;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const { FilesetResolver, HandLandmarker } = await import(
        /* @vite-ignore */ `${data.base}models/vision_bundle.mjs`
      );
      const files = await FilesetResolver.forVisionTasks(
        `${data.base}models/wasm`,
      );
      // CPU inference stays in this worker, leaving the render GPU available for particles.
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.model, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.65,
        minHandPresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame") {
      try {
        if (!model) throw new Error("Hand model is not ready.");
        const start = performance.now();
        const result = model.detectForVideo(data.frame, data.capturedAt);
        self.postMessage({
          type: "result",
          result,
          capturedAt: data.capturedAt,
          inferenceMs: performance.now() - start,
        });
      } finally {
        data.frame.close();
      }
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
