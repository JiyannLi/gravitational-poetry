import { HandInference } from "./HandInference";
import { emptyInteraction, type Interaction } from "../physics/field";
export class GestureLatch {
  private candidate = false;
  private since = 0;
  value = false;
  update(score: number, time: number) {
    const next = score > (this.value ? 0.38 : 0.62);
    if (next !== this.candidate) {
      this.candidate = next;
      this.since = time;
    }
    if (time - this.since > 140) this.value = next;
    return this.value;
  }
}
/** Preview begins immediately; only a deliberate release commits a single body. */
export class CreationHold {
  private since: number | null = null;
  private releaseSince: number | null = null;
  progress = 0;
  active = false;
  reset() {
    this.since = null;
    this.releaseSince = null;
    this.progress = 0;
    this.active = false;
  }
  update(pinch: number, time: number) {
    if (this.since === null) {
      if (pinch >= 0.72) {
        this.since = time;
        this.progress = 0;
        this.active = true;
      }
      return false;
    }
    if (pinch < 0.45) {
      this.releaseSince ??= time;
      if (time - this.releaseSince < 40) return false;
      const commit = this.releaseSince - this.since >= 450;
      this.since = null;
      this.releaseSince = null;
      this.active = false;
      return commit;
    }
    this.releaseSince = null;
    this.progress = Math.min(1, (time - this.since) / 650);
    return false;
  }
}
export class Hands {
  private model: HandInference | null = null;
  private video = document.createElement("video");
  private stream: MediaStream | null = null;
  private lastFrame = 0;
  private lastObservedAt = 0;
  private disposed = false;
  private input = emptyInteraction();
  private birthHold = new CreationHold();
  private birthSequence = 0;
  private birthPosition: [number, number, number] = [0, 0, 0];
  readonly diagnostics = {
    inferenceMs: 0,
    resultIntervalMs: 0,
    resultAgeMs: 0,
    samples: 0,
    captureToResultMs: 0,
    inFlight: 0,
  };
  private latches = [new GestureLatch(), new GestureLatch()];
  async start() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Camera requires HTTPS and a supported browser. Pointer mode remains available.",
      );
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          frameRate: { ideal: 30, max: 30 },
          facingMode: "user",
        },
        audio: false,
      });
      if (this.disposed) {
        this.stop();
        return false;
      }
      this.video.srcObject = this.stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play();
      const model = new HandInference();
      this.model = model;
      await model.start(
        new URL(import.meta.env.BASE_URL, location.href).href,
        new URL(
          import.meta.env.VITE_HAND_MODEL_URL ||
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          location.href,
        ).href,
      );
      if (this.disposed) {
        this.stop();
        return false;
      }
      return true;
    } catch (e) {
      this.stop();
      throw e;
    }
  }
  read(time: number, aspect: number): Interaction {
    if (
      this.model &&
      !this.stream?.getVideoTracks().some((t) => t.readyState === "live")
    )
      throw new Error("Camera disconnected.");
    if (!this.model || this.video.readyState < 2) {
      this.birthHold.reset();
      return emptyInteraction();
    }
    const result = this.model.detectForVideo(this.video, time);
    const worker = this.model.diagnostics;
    if (worker) {
      this.diagnostics.inferenceMs = worker.inferenceMs;
      this.diagnostics.captureToResultMs = worker.captureToResultMs;
      this.diagnostics.inFlight = worker.inFlight;
    }
    this.diagnostics.resultAgeMs = time - this.lastObservedAt;
    if (!result) {
      // Results older than the deadline never keep controlling a vanished hand.
      if (
        time - this.lastFrame >
        Math.min(1000, Math.max(200, this.diagnostics.captureToResultMs * 2))
      ) {
        this.birthHold.reset();
        return emptyInteraction();
      }
      return this.input;
    }
    const observedAt = result.capturedAt ?? time;
    if (time - observedAt > 1000) {
      this.birthHold.reset();
      return emptyInteraction();
    }
    this.diagnostics.resultIntervalMs = this.lastFrame
      ? time - this.lastFrame
      : 0;
    this.lastFrame = time;
    this.lastObservedAt = observedAt;
    this.diagnostics.resultAgeMs = time - observedAt;
    this.diagnostics.samples++;
    this.input = { active: false, expansion: 0, fields: [] };
    let leftTracked = false;
    result.landmarks.forEach((landmarks, i) => {
      if ((result.handedness[i]?.[0]?.score ?? 0) < 0.65) return;
      const palm = landmarks[9],
        wrist = landmarks[0];
      const distance = (a: number, b: number) =>
        Math.hypot(
          landmarks[a].x - landmarks[b].x,
          landmarks[a].y - landmarks[b].y,
        );
      const scale = Math.max(0.04, distance(0, 9));
      const pinch = 1 - Math.min(1, distance(4, 8) / scale);
      const extension =
        [8, 12, 16, 20].reduce((s, j) => s + distance(j, 0) / scale, 0) / 4;
      const left = result.handedness[i][0].categoryName === "Left";
      const fist = this.latches[left ? 0 : 1].update(
        1 - Math.min(1, Math.max(0, (extension - 1) / 0.8)),
        observedAt,
      );
      this.input.fields[left ? 0 : 1] = {
        position: [
          (1 - ((palm.x + wrist.x) / 2) * 2) * 22 * aspect,
          (1 - (palm.y + wrist.y)) * 22,
          0,
        ],
        strength: left ? 4 + pinch * 20 : 8 + pinch * 35 + (fist ? 25 : 0),
        radius: 8,
        creation: left ? Math.max(0, 1 - pinch) : 0,
      };
      if (left) {
        leftTracked = true;
        const released = this.birthHold.update(pinch, observedAt);
        if (pinch >= 0.45)
          this.birthPosition = [...this.input.fields[0].position];
        if (this.birthHold.active)
          this.input.formation = {
            position: [...this.birthPosition],
            progress: this.birthHold.progress,
          };
        if (released)
          this.input.birth = {
            sequence: ++this.birthSequence,
            position: [...this.birthPosition],
            progress: this.birthHold.progress,
          };
        // Open palm scatters the local dust; it never destroys a released body.
        this.input.expansion = pinch < 0.25 ? 1 : 0;
      }
      this.input.active = true;
    });
    if (!leftTracked) this.birthHold.reset();
    return this.input;
  }
  stop() {
    this.disposed = true;
    this.birthHold.reset();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.model?.close();
    this.model = null;
  }
}
