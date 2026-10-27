import type { HandLandmarker } from "@mediapipe/tasks-vision";
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
/** Continuous confident hold with hysteresis; one creation per release cycle. */
export class CreationHold {
  private since: number | null = null;
  private fired = false;
  reset() {
    this.since = null;
    this.fired = false;
  }
  update(pinch: number, time: number) {
    if (pinch < 0.45) {
      this.reset();
      return false;
    }
    if (this.since === null) {
      if (pinch >= 0.72) this.since = time;
      return false;
    }
    if (!this.fired && time - this.since >= 1100) {
      this.fired = true;
      return true;
    }
    return false;
  }
}
export class Hands {
  private model: HandLandmarker | null = null;
  private video = document.createElement("video");
  private stream: MediaStream | null = null;
  private lastTime = -1;
  private lastFrame = 0;
  private disposed = false;
  private input = emptyInteraction();
  private birthHold = new CreationHold();
  private birthSequence = 0;
  private latches = [new GestureLatch(), new GestureLatch()];
  async start() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Camera requires HTTPS and a supported browser. Pointer mode remains available.",
      );
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
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
      const { FilesetResolver, HandLandmarker } =
        await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(
        `${import.meta.env.BASE_URL}models/wasm`,
      );
      this.model = await HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath:
            import.meta.env.VITE_HAND_MODEL_URL ||
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.65,
        minHandPresenceConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });
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
    if (
      time - this.lastFrame < 50 ||
      this.video.currentTime === this.lastTime
    ) {
      if (time - this.lastFrame > 500) {
        this.birthHold.reset();
        return emptyInteraction();
      }
      return this.input;
    }
    if (time - this.lastFrame > 500) this.birthHold.reset();
    this.lastTime = this.video.currentTime;
    this.lastFrame = time;
    const result = this.model.detectForVideo(this.video, time);
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
        time,
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
        if (this.birthHold.update(pinch, time))
          this.input.birth = {
            sequence: ++this.birthSequence,
            position: [...this.input.fields[0].position],
          };
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
