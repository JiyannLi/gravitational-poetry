import { useEffect, useRef, useState } from "react";
import { Universe, type OrbitStatus } from "../scene/Universe";
import { BODY_CONFIG, type OrbitPreset } from "../physics/BodySystem";
export function App() {
  const host = useRef<HTMLDivElement>(null),
    universe = useRef<Universe | null>(null);
  const [error, setError] = useState(""),
    [fatal, setFatal] = useState(false),
    [stats, setStats] = useState({ fps: 0, count: 65536, state: "Silence" });
  const [camera, setCamera] = useState<"off" | "loading" | "on">("off"),
    [mode, setMode] = useState<"gravity" | "creation" | "star">("gravity"),
    [paused, setPaused] = useState(false),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false),
    [hidden, setHidden] = useState(false),
    [started, setStarted] = useState(false),
    [speed, setSpeed] = useState(1),
    [bloom, setBloom] = useState(0.62);
  const [systems, setSystems] = useState(false);
  const [mass, setMass] = useState(BODY_CONFIG.defaultMass);
  const [orbit, setOrbit] = useState<OrbitStatus>({
    stars: 0,
    preset: "empty",
    event: "",
    gain: 0,
    notice: "",
  });
  useEffect(() => {
    try {
      universe.current = new Universe(
        host.current!,
        (fps, count, state) => setStats({ fps, count, state }),
        (message) => {
          setError(message);
          setCamera("off");
        },
        setOrbit,
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
      if (started && !settings && !help && !systems)
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
  }, [started, settings, help, systems]);
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
      if (e.key.toLowerCase() === "s") {
        changeMode("star");
        setSystems(true);
        setStarted(true);
      }
      if (e.key.toLowerCase() === "b") loadPreset("binary");
      if (e.key.toLowerCase() === "t") loadPreset("three-body");
      if (e.key.toLowerCase() === "l") loadPreset("slingshot");
      if (e.key === "Escape") {
        setSettings(false);
        setHelp(false);
        setSystems(false);
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
  function changeMode(value: "gravity" | "creation" | "star") {
    setMode(value);
    if (universe.current) universe.current.pointer.mode = value;
  }
  function loadPreset(preset: OrbitPreset) {
    universe.current?.loadSystem(preset);
    changeMode("gravity");
    setStarted(true);
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
          AN INTERACTIVE COSMIC EXPERIENCE<span>002 — THE ORBITAL AGE</span>
        </div>
        <button
          className="icon-button"
          aria-label="Open guide"
          onClick={() => {
            setHelp(!help);
            setSystems(false);
          }}
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
        <span>OBSERVATORY / 002</span>
        {orbit.stars > 0 && (
          <span className="body-count" aria-live="polite">
            {orbit.stars} {orbit.stars === 1 ? "STAR" : "STARS"} ·{" "}
            {orbit.preset === "three-body"
              ? "THREE-BODY"
              : orbit.preset.toUpperCase()}
          </span>
        )}
      </aside>
      <div className="state chrome">
        <span className="status-dot" />
        <span>{paused ? "TIME SUSPENDED" : stats.state.toUpperCase()}</span>
        <small>
          {stats.count.toLocaleString()} PARTICLES <span>·</span> {stats.fps}{" "}
          FPS
        </small>
      </div>
      {orbit.event && (
        <div className="orbital-event chrome" role="status">
          <span>AN EMERGENT MOMENT</span>
          <p>{orbit.event}</p>
          {orbit.gain > 0 && (
            <small>Energy transferred. A new trajectory.</small>
          )}
        </div>
      )}
      {mode === "star" && (
        <div className="placement-hint chrome">
          Tap the universe to place a star · {orbit.stars}/3
        </div>
      )}
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
            hand controls gravity. Pinch to concentrate; hold a left pinch for a
            second to form one star, then release before creating another. Hold
            a right fist to strengthen the field.
          </p>
          <p>
            <b>S</b> places a star. <b>B</b> seeds a binary orbit. <b>T</b>{" "}
            begins three-body motion. <b>L</b> launches a gravity-assist
            encounter. Switch to Gravity to gently pull stars without moving
            them instantly.
          </p>
          <small>
            Your universe keeps evolving when your hands leave. Camera frames
            never leave this device.
          </small>
        </section>
      )}
      {systems && (
        <section
          className="panel systems-panel chrome"
          aria-label="Celestial systems"
        >
          <button
            className="close"
            aria-label="Close systems"
            onClick={() => setSystems(false)}
          >
            ×
          </button>
          <div className="eyebrow">CHAPTER II / ORBITAL POETRY</div>
          <h2>Let gravity write.</h2>
          <p>
            Plant a star, or give a system its first motion. Everything that
            follows is gravity.
          </p>
          <div className="system-options">
            <button
              className={mode === "star" ? "active" : ""}
              onClick={() => {
                changeMode("star");
                setStarted(true);
              }}
            >
              Place a star <span>S</span>
            </button>
            <button onClick={() => loadPreset("binary")}>
              Binary stars <span>B</span>
            </button>
            <button onClick={() => loadPreset("three-body")}>
              Three-body motion <span>T</span>
            </button>
            <button onClick={() => loadPreset("slingshot")}>
              Gravitational slingshot <span>L</span>
            </button>
          </div>
          <label>
            New star mass <output>{mass}</output>
            <input
              type="range"
              aria-label="New star mass"
              min={BODY_CONFIG.minMass}
              max={BODY_CONFIG.maxMass}
              step="2"
              value={mass}
              onChange={(e) => {
                setMass(+e.target.value);
                if (universe.current)
                  universe.current.starMass = +e.target.value;
              }}
            />
          </label>
          <div className="system-bottom">
            <span>{orbit.stars} / 3 stars</span>
            <button onClick={() => universe.current?.clearStars()}>
              Clear stars
            </button>
          </div>
          <small role="status">
            {orbit.notice ||
              "Hand and pointer fields pull stars with inertia. Let go to watch them evolve."}
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
            Particle density is selected at startup and stays stable. Audio
            arrives in a later chapter.
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
          <button
            aria-label="Celestial systems"
            aria-expanded={systems}
            className={systems ? "selected" : ""}
            onClick={() => {
              setSystems(!systems);
              setSettings(false);
              setHelp(false);
            }}
          >
            ✺
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
            onClick={() => {
              setSettings(!settings);
              setSystems(false);
            }}
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
