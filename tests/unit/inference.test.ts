import { it, expect, vi } from "vitest";
import { HandInference } from "../../src/gestures/HandInference";
it("waits for initialization, drops busy frames, sends only the latest frame, and closes pending captures", async () => {
  let worker: any;
  const sent: any[] = [];
  let finishCapture: ((value: any) => void) | undefined;
  class FakeWorker {
    onmessage: any;
    onerror: any;
    terminated = false;
    constructor() {
      worker = this;
    }
    postMessage(data: any) {
      sent.push(data);
    }
    terminate() {
      this.terminated = true;
    }
  }
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finishCapture = resolve;
        }),
    ),
  );
  const client = new HandInference();
  try {
    const start = client.start("/", "/model");
    const video = { currentTime: 0 } as HTMLVideoElement;
    client.detectForVideo(video, 1000);
    expect(createImageBitmap).not.toHaveBeenCalled();
    worker.onmessage({ data: { type: "ready" } });
    await start;
    client.detectForVideo(video, 1000);
    for (let i = 1; i < 60; i++) {
      video.currentTime = i / 60;
      client.detectForVideo(video, 1000 + i * 20);
    }
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
    finishCapture!({ close: vi.fn() });
    await Promise.resolve();
    expect(sent.filter((s) => s.type === "frame")).toHaveLength(1);
    worker.onmessage({
      data: {
        type: "result",
        result: { landmarks: [], handedness: [] },
        capturedAt: 1000,
        inferenceMs: 50,
      },
    });
    video.currentTime = 2;
    expect(client.detectForVideo(video, 2200)?.capturedAt).toBe(1000);
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    client.close();
    const close = vi.fn();
    finishCapture!({ close });
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
    expect(worker.terminated).toBe(true);
    expect(sent.filter((s) => s.type === "frame")).toHaveLength(1);
  } finally {
    client.close();
    vi.unstubAllGlobals();
  }
});
