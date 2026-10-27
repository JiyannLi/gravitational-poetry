import { useEffect, useRef, useState } from "react";
import { Universe } from "../scene/Universe";
export function App() {
  const host = useRef<HTMLDivElement>(null),
    universe = useRef<Universe | null>(null);
  const [error, setError] = useState(""),
    [fatal, setFatal] = useState(false),
    [stats, setStats] = useState({ fps: 0, count: 65536, state: "Silence" });
  const [camera, setCamera] = useState<"off" | "loading" | "on">("off"),
    [mode, setMode] = useState<"gravity" | "creation">("gravity"),
    [paused, setPaused] = useState(false),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false),
    [hidden, setHidden] = useState(false),
    [started, setStarted] = useState(false),
    [speed, setSpeed] = useState(1),
    [bloom, setBloom] = useState(0.62);
  useEffect(() => {
    try {
      universe.current = new Universe(
        host.current!,
        (fps, count, state) => setStats({ fps, count, state }),
        setError,
      );
    } catch (e) {
      setFatal(true);
      setError(
        `WebGL2 is unavailable on this device. Enable hardware acceleration or try a current browser. ${e instanceof Error ? e.message : ""}`,
      );
    }
    return () => universe.current?.dispose();
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setHidden(false);
      clearTimeout(timer);
      if (started && !settings && !help)
        timer = setTimeout(() => setHidden(true), 6500);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [started, settings, help]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => {
          if (universe.current) universe.current.paused = !p;
          return !p;
        });
      }
      if (e.key.toLowerCase() === "g") changeMode("gravity");
      if (e.key.toLowerCase() === "c") changeMode("creation");
      if (e.key === "Escape") {
        setSettings(false);
        setHelp(false);
      }
    };
    window.addEventListener("keydown", keys);
    const visibility = () => {
      if (document.hidden) setCamera("off");
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keys);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  function changeMode(value: "gravity" | "creation") {
    setMode(value);
    if (universe.current) universe.current.pointer.mode = value;
  }
  async function enableCamera() {
    if (camera === "on") {
      universe.current?.disableCamera();
      setCamera("off");
      return;
    }
    setCamera("loading");
    setError("");
    try {
      const connected = await universe.current?.enableCamera();
      setCamera(connected ? "on" : "off");
      if (connected) setStarted(true);
    } catch (e) {
      setCamera("off");
      setError(
        e instanceof Error
          ? e.message
          : "Unable to start the camera. Use pointer mode.",
      );
    }
  }
  function pause() {
    setPaused(!paused);
    if (universe.current) universe.current.paused = !paused;
  }
  return (
    <main className={hidden ? "immersed" : ""}>
      <div
        ref={host}
        className="universe"
        aria-label="Interactive three-dimensional gravitational universe"
        onPointerDown={() => setStarted(true)}
      />
      <div className="vignette" />
      <header className="chrome">
        <a className="wordmark" href="./">
          <span className="orbit-logo">✧</span>
          <span>
            GRAVITATIONAL
            <br />
            <b>POETRY</b>
          </span>
        </a>
        <div className="edition">
          AN INTERACTIVE COSMIC EXPERIENCE<span>001 — THE FIRST LIGHT</span>
        </div>
        <button
          className="icon-button"
          aria-label="Open guide"
          onClick={() => setHelp(!help)}
        >
          ?
        </button>
      </header>
      <section className={`intro chrome ${started ? "compact" : ""}`}>
        <div className="eyebrow">
          <span /> A UNIVERSE IN YOUR HANDS
        </div>
        <h1>
          Gravitational
          <br />
          <em>Poetry.</em>
        </h1>
        <p>Become the Architect of the Cosmos.</p>
        <div className="intro-rule" />
        <span className="intro-caption">引力诗篇 · ORDER FROM CHAOS</span>
      </section>
      {!started && !fatal && (
        <section className="invitation chrome">
          <span className="spark">✧</span>
          <h2>Your universe awaits.</h2>
          <p>
            Move your cursor to bend gravity.
            <br />
            Or open your hands to begin.
          </p>
          <button
            className="camera-button"
            disabled={camera === "loading"}
            onClick={enableCamera}
          >
            {camera === "loading"
              ? "Connecting to the cosmos…"
              : "Enable camera"}{" "}
            <span>↗</span>
          </button>
          <button className="text-button" onClick={() => setStarted(true)}>
            Explore with mouse <span>→</span>
          </button>
          <small>Camera processing stays on your device.</small>
        </section>
      )}
      <aside className="coordinates chrome">
        <span>RA 23h 18m 42s</span>
        <span>DEC +61° 32′ 08″</span>
        <i />
        <span>OBSERVATORY / 001</span>
      </aside>
      <div className="state chrome">
        <span className="status-dot" />
        <span>{paused ? "TIME SUSPENDED" : stats.state.toUpperCase()}</span>
        <small>
          {stats.count.toLocaleString()} PARTICLES <span>·</span> {stats.fps}{" "}
          FPS
        </small>
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}
          {!fatal && (
            <button aria-label="Dismiss message" onClick={() => setError("")}>
              ×
            </button>
          )}
        </div>
      )}
      {help && (
        <section className="panel guide chrome">
          <button
            className="close"
            aria-label="Close guide"
            onClick={() => setHelp(false)}
          >
            ×
          </button>
          <div className="eyebrow">FIELD NOTES / 01</div>
          <h2>Shape the unseen.</h2>
          <p>
            Move to pull stardust. Hold to deepen the gravitational well. Scroll
            to change its reach.
          </p>
          <p>
            <b>C</b> creates a flowing nebula. <b>G</b> returns to gravity.{" "}
            <b>Space</b> suspends time. On touchscreens, drag or use two fingers
            for two fields.
          </p>
          <p>
            With the camera enabled: your left hand shapes matter; your right
            hand controls gravity. Pinch to concentrate, hold a fist to
            strengthen the field.
          </p>
          <small>
            Your universe keeps evolving when your hands leave. Camera frames
            never leave this device.
          </small>
        </section>
      )}
      {settings && (
        <section className="panel chrome">
          <div className="eyebrow">OBSERVATORY SETTINGS</div>
          <h2>A different rhythm.</h2>
          <label>
            Time flow <output>{speed}×</output>
            <input
              aria-label="Time flow"
              type="range"
              min=".25"
              max="2"
              step=".25"
              value={speed}
              onChange={(e) => {
                setSpeed(+e.target.value);
                if (universe.current) universe.current.speed = +e.target.value;
              }}
            />
          </label>
          <label>
            Bloom <output>{bloom.toFixed(2)}</output>
            <input
              aria-label="Bloom"
              type="range"
              min="0"
              max="1.2"
              step=".02"
              value={bloom}
              onChange={(e) => {
                setBloom(+e.target.value);
                universe.current?.setBloom(+e.target.value);
              }}
            />
          </label>
          <small>
            Particle visibility and resolution adapt to device performance.
            Audio arrives in a later chapter.
          </small>
        </section>
      )}
      <footer className="chrome">
        <div className="mode-label">
          CREATOR MODE
          <span>
            {camera === "on" ? "HANDS CONNECTED" : "POINTER CONNECTED"}
          </span>
        </div>
        <nav aria-label="Universe controls">
          <button
            className={mode === "gravity" ? "selected" : ""}
            title="Gravity (G)"
            onClick={() => changeMode("gravity")}
          >
            <span>◎</span>
            <span className="button-label">Gravity</span>
          </button>
          <button
            className={mode === "creation" ? "selected" : ""}
            title="Create nebula (C)"
            onClick={() => changeMode("creation")}
          >
            <span>✧</span>
            <span className="button-label">Create</span>
          </button>
          <i />
          <button aria-label={paused ? "Resume" : "Pause"} onClick={pause}>
            {paused ? "▷" : "Ⅱ"}
          </button>
          <button
            aria-label="Reset universe"
            onClick={() => universe.current?.reset()}
          >
            ↺
          </button>
          <button
            aria-label="Screenshot"
            onClick={() => universe.current?.screenshot()}
          >
            ▣
          </button>
          <button
            aria-label="Settings"
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
          >
            ⚙
          </button>
          <button
            aria-label={camera === "on" ? "Disable camera" : "Enable camera"}
            disabled={camera === "loading"}
            className={camera === "on" ? "selected" : ""}
            onClick={enableCamera}
          >
            ⌾
          </button>
        </nav>
        <div className="footer-note">
          NOT A GAME.
          <br />
          <span>A MOMENT OF CREATION.</span>
        </div>
      </footer>
    </main>
  );
}
