import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
export type Observation = HandLandmarkerResult & { capturedAt?: number };
/** One transferable frame in flight. Slow inference never queues stale camera frames. */
export class HandInference {
  private worker = new Worker(
    new URL("./inference.worker.ts", import.meta.url),
  );
  private busy = false;
  private ready = false;
  private disposed = false;
  private latest: Observation | null = null;
  private error: Error | null = null;
  private lastVideoTime = -1;
  private lastSent = -Infinity;
  private rejectStart: ((error: Error) => void) | null = null;
  readonly diagnostics = {
    inferenceMs: 0,
    captureToResultMs: 0,
    inFlight: 0,
    completed: 0,
  };
  start(base: string, model: string) {
    return new Promise<void>((resolve, reject) => {
      this.rejectStart = reject;
      this.worker.onerror = (e) => {
        this.error = new Error(e.message || "Hand recognition worker failed.");
        reject(this.error);
      };
      this.worker.onmessage = ({ data }) => {
        if (this.disposed) return;
        if (data.type === "ready") {
          this.ready = true;
          this.rejectStart = null;
          resolve();
        }
        if (data.type === "error") {
          this.busy = false;
          this.diagnostics.inFlight = 0;
          this.error = new Error(data.message);
          reject(this.error);
        }
        if (data.type === "result") {
          this.busy = false;
          this.diagnostics.inFlight = 0;
          this.diagnostics.inferenceMs = data.inferenceMs;
          this.diagnostics.captureToResultMs =
            performance.now() - data.capturedAt;
          this.diagnostics.completed++;
          this.latest = { ...data.result, capturedAt: data.capturedAt };
        }
      };
      this.worker.postMessage({ type: "init", base, model });
    });
  }
  detectForVideo(video: HTMLVideoElement, time: number): Observation | null {
    if (this.error) throw this.error;
    const result = this.latest;
    this.latest = null;
    if (
      this.ready &&
      !this.disposed &&
      !this.busy &&
      video.currentTime !== this.lastVideoTime &&
      time - this.lastSent >= 1000 / 30 - 1
    ) {
      this.busy = true;
      this.diagnostics.inFlight = 1;
      this.lastVideoTime = video.currentTime;
      this.lastSent = time;
      createImageBitmap(video)
        .then((frame) => {
          if (this.disposed) {
            frame.close();
            return;
          }
          this.worker.postMessage({ type: "frame", frame, capturedAt: time }, [
            frame,
          ]);
        })
        .catch((error) => {
          this.busy = false;
          this.diagnostics.inFlight = 0;
          this.error = new Error(`Camera frame capture failed: ${error}`);
        });
    }
    return result;
  }
  close() {
    this.disposed = true;
    this.worker.terminate();
    this.latest = null;
    this.busy = false;
    this.diagnostics.inFlight = 0;
    this.rejectStart?.(new Error("Camera initialization cancelled."));
    this.rejectStart = null;
  }
}
