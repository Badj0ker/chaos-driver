import { useEffect, useRef, useState, useCallback } from "react";
import veraAsset from "@/assets/vera.png.asset.json";

type Ped = { x: number; y: number; dir: number; speed: number; alive: boolean; flyX: number; flyY: number; rot: number };
type Prop = { x: number; y: number; kind: "cone" | "bin" | "hydrant" | "tree"; smashed: boolean };
type Car = { x: number; y: number; angle: number; wrecked: boolean; hue: number };
type Debris = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const ROAD = 110;
const BLOCK = 460;
const WORLD = 5200;
const GAME_TIME = 60;

const FAULT_LINES = [
  "Vera, that was a person!",
  "The brake is the OTHER pedal!",
  "Mirrors! Signal! ...Anything!",
  "That bin had a family, Vera.",
  "We call this 'parking'? Really?",
  "I'm noting that down. In red.",
  "Legally, I have to scream now.",
  "Sidewalks are not shortcuts!",
  "You just invented a new lane.",
  "My insurance guy is crying.",
];
const IDLE_LINES = [
  "Hands at ten and two, Vera.",
  "Take a breath. Please.",
  "Nice and slow... oh no.",
  "Speed limit is a limit.",
];

function rnd(a: number, b: number) {
  return a + Math.random() * (b - a);
}
function onRoad(v: number) {
  const m = ((v % BLOCK) + BLOCK) % BLOCK;
  return m < ROAD;
}

export default function VeraDrivingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"intro" | "playing" | "over">("intro");
  const [hud, setHud] = useState({ time: GAME_TIME, faults: 0, chaos: 0, speech: "Start the engine, Vera." });
  const [best, setBest] = useState(0);
  const stateRef = useRef<any>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef({ left: false, right: false, gas: false, brake: false });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const v = Number(localStorage.getItem("vera-best") || 0);
    if (v) setBest(v);
  }, []);

  const startGame = useCallback(() => {
    const peds: Ped[] = [];
    const props: Prop[] = [];
    const cars: Car[] = [];
    for (let i = 0; i < 240; i++) {
      const x = rnd(0, WORLD);
      const y = rnd(0, WORLD);
      if (onRoad(x) || onRoad(y)) peds.push({ x, y, dir: rnd(0, Math.PI * 2), speed: rnd(12, 34), alive: true, flyX: 0, flyY: 0, rot: 0 });
    }
    for (let i = 0; i < 320; i++) {
      const x = rnd(0, WORLD);
      const y = rnd(0, WORLD);
      const kinds: Prop["kind"][] = ["cone", "bin", "hydrant", "tree"];
      props.push({ x, y, kind: kinds[Math.floor(rnd(0, 4))], smashed: false });
    }
    for (let i = 0; i < 60; i++) {
      const x = rnd(0, WORLD);
      const y = rnd(0, WORLD);
      if (onRoad(x)) cars.push({ x: Math.floor(x / BLOCK) * BLOCK + ROAD / 2, y, angle: 0, wrecked: false, hue: rnd(0, 360) });
      else if (onRoad(y)) cars.push({ x, y: Math.floor(y / BLOCK) * BLOCK + ROAD / 2, angle: Math.PI / 2, wrecked: false, hue: rnd(0, 360) });
    }
    stateRef.current = {
      car: { x: ROAD / 2, y: ROAD / 2, angle: 0, speed: 0, shake: 0 },
      peds,
      props,
      cars,
      debris: [] as Debris[],
      skid: [] as { x: number; y: number; a: number }[],
      time: GAME_TIME,
      faults: 0,
      chaos: 0,
      speech: "Green light. Go gently.",
      speechT: 3,
      last: performance.now(),
    };
    setHud({ time: GAME_TIME, faults: 0, chaos: 0, speech: "Green light. Go gently." });
    setPhase("playing");
  }, []);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => (keysRef.current[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", kd, { passive: false });
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const face = new Image();
    face.src = veraAsset.url;

    let raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = stateRef.current;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (!s) {
        ctx.fillStyle = "#101820";
        ctx.fillRect(0, 0, W, H);
        return;
      }
      let dt = Math.min((now - s.last) / 1000, 0.05);
      s.last = now;
      const playing = phaseRef.current === "playing";
      if (!playing) dt = 0;

      const k = keysRef.current;
      const t = touchRef.current;
      const gas = k["arrowup"] || k["w"] || t.gas;
      const brake = k["arrowdown"] || k["s"] || t.brake;
      const left = k["arrowleft"] || k["a"] || t.left;
      const right = k["arrowright"] || k["d"] || t.right;

      const c = s.car;
      if (gas) c.speed += 460 * dt;
      else if (brake) c.speed -= 520 * dt;
      else c.speed *= Math.exp(-0.8 * dt);
      c.speed = Math.max(-160, Math.min(560, c.speed));
      const steer = (left ? -1 : 0) + (right ? 1 : 0);
      // deliberately twitchy steering: Vera cannot drive
      c.angle += steer * dt * 3.1 * Math.min(1, Math.abs(c.speed) / 120) * (c.speed < 0 ? -1 : 1);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      c.x = Math.max(0, Math.min(WORLD, c.x));
      c.y = Math.max(0, Math.min(WORLD, c.y));
      c.shake = Math.max(0, c.shake - dt * 3);

      if (Math.abs(c.speed) > 220 && Math.abs(steer) > 0 && Math.random() < 0.5) {
        s.skid.push({ x: c.x, y: c.y, a: c.angle });
        if (s.skid.length > 260) s.skid.shift();
      }

      const say = (line: string) => {
        s.speech = line;
        s.speechT = 2.4;
      };

      // pedestrians
      for (const p of s.peds) {
        if (p.alive) {
          p.x += Math.cos(p.dir) * p.speed * dt;
          p.y += Math.sin(p.dir) * p.speed * dt;
          if (Math.random() < 0.01) p.dir += rnd(-1, 1);
          const d = Math.hypot(p.x - c.x, p.y - c.y);
          if (d < 26 && Math.abs(c.speed) > 40) {
            p.alive = false;
            const a = Math.atan2(p.y - c.y, p.x - c.x);
            p.flyX = Math.cos(a) * (140 + Math.abs(c.speed));
            p.flyY = Math.sin(a) * (140 + Math.abs(c.speed));
            s.faults += 3;
            s.chaos += 100;
            c.shake = 1;
            for (let i = 0; i < 8; i++)
              s.debris.push({ x: p.x, y: p.y, vx: rnd(-160, 160), vy: rnd(-160, 160), life: 0.8, color: "#ffd166" });
            say(FAULT_LINES[Math.floor(Math.random() * FAULT_LINES.length)]);
          }
        } else {
          p.x += p.flyX * dt;
          p.y += p.flyY * dt;
          p.flyX *= Math.exp(-2.4 * dt);
          p.flyY *= Math.exp(-2.4 * dt);
          p.rot += dt * 9;
        }
      }
      // props
      for (const p of s.props) {
        if (p.smashed) continue;
        if (Math.hypot(p.x - c.x, p.y - c.y) < 24 && Math.abs(c.speed) > 30) {
          p.smashed = true;
          s.chaos += 30;
          s.faults += 1;
          c.shake = 0.6;
          c.speed *= 0.82;
          for (let i = 0; i < 6; i++)
            s.debris.push({ x: p.x, y: p.y, vx: rnd(-120, 120), vy: rnd(-120, 120), life: 0.6, color: "#8de1ff" });
          if (Math.random() < 0.35) say(FAULT_LINES[Math.floor(Math.random() * FAULT_LINES.length)]);
        }
      }
      // parked cars
      for (const oc of s.cars) {
        if (oc.wrecked) continue;
        if (Math.hypot(oc.x - c.x, oc.y - c.y) < 42 && Math.abs(c.speed) > 60) {
          oc.wrecked = true;
          s.chaos += 250;
          s.faults += 5;
          c.shake = 1.4;
          c.speed *= -0.35;
          for (let i = 0; i < 14; i++)
            s.debris.push({ x: oc.x, y: oc.y, vx: rnd(-240, 240), vy: rnd(-240, 240), life: 1, color: "#ff8a5b" });
          say("THAT WAS A PARKED CAR, VERA!");
        }
      }
      for (const d of s.debris) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.life -= dt;
      }
      s.debris = s.debris.filter((d: Debris) => d.life > 0);

      s.speechT -= dt;
      if (s.speechT <= 0 && playing) say(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)]);

      if (playing) {
        s.time -= dt;
        if (s.time <= 0) {
          s.time = 0;
          const score = Math.round(s.chaos);
          const prev = Number(localStorage.getItem("vera-best") || 0);
          if (score > prev) {
            localStorage.setItem("vera-best", String(score));
            setBest(score);
          }
          setPhase("over");
        }
      }

      // ---------- render ----------
      const camX = c.x - W / 2 + (c.shake ? rnd(-8, 8) * c.shake : 0);
      const camY = c.y - H / 2 + (c.shake ? rnd(-8, 8) * c.shake : 0);
      ctx.fillStyle = "#39543f";
      ctx.fillRect(0, 0, W, H);

      const startX = Math.floor(camX / BLOCK) * BLOCK;
      const startY = Math.floor(camY / BLOCK) * BLOCK;
      ctx.fillStyle = "#2c3238";
      for (let x = startX; x < camX + W + BLOCK; x += BLOCK) ctx.fillRect(x - camX, 0, ROAD, H);
      for (let y = startY; y < camY + H + BLOCK; y += BLOCK) ctx.fillRect(0, y - camY, W, ROAD);
      // buildings
      for (let x = startX; x < camX + W + BLOCK; x += BLOCK)
        for (let y = startY; y < camY + H + BLOCK; y += BLOCK) {
          const bx = x + ROAD + 18 - camX;
          const by = y + ROAD + 18 - camY;
          const size = BLOCK - ROAD - 60;
          const hue = ((x * 7 + y * 13) / BLOCK) % 40;
          ctx.fillStyle = `hsl(${30 + hue}, 12%, ${26 + (hue % 8)}%)`;
          ctx.fillRect(bx, by, size, size);
          ctx.fillStyle = "rgba(255,220,150,0.13)";
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) ctx.fillRect(bx + 22 + i * 60, by + 22 + j * 60, 26, 26);
        }
      // lane dashes
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.setLineDash([18, 22]);
      ctx.lineWidth = 3;
      for (let x = startX; x < camX + W + BLOCK; x += BLOCK) {
        ctx.beginPath();
        ctx.moveTo(x + ROAD / 2 - camX, 0);
        ctx.lineTo(x + ROAD / 2 - camX, H);
        ctx.stroke();
      }
      for (let y = startY; y < camY + H + BLOCK; y += BLOCK) {
        ctx.beginPath();
        ctx.moveTo(0, y + ROAD / 2 - camY);
        ctx.lineTo(W, y + ROAD / 2 - camY);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // skid marks
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 5;
      for (const sk of s.skid) {
        ctx.beginPath();
        ctx.moveTo(sk.x - camX, sk.y - camY);
        ctx.lineTo(sk.x - camX - Math.cos(sk.a) * 10, sk.y - camY - Math.sin(sk.a) * 10);
        ctx.stroke();
      }

      const vis = (x: number, y: number) => x - camX > -80 && x - camX < W + 80 && y - camY > -80 && y - camY < H + 80;

      for (const p of s.props) {
        if (!vis(p.x, p.y)) continue;
        const x = p.x - camX;
        const y = p.y - camY;
        ctx.save();
        ctx.translate(x, y);
        if (p.smashed) ctx.globalAlpha = 0.45;
        if (p.kind === "cone") {
          ctx.fillStyle = "#ff7a3d";
          ctx.beginPath();
          ctx.moveTo(0, -9);
          ctx.lineTo(8, 9);
          ctx.lineTo(-8, 9);
          ctx.fill();
        } else if (p.kind === "bin") {
          ctx.fillStyle = "#4a8f6a";
          ctx.fillRect(-9, -9, 18, 18);
        } else if (p.kind === "hydrant") {
          ctx.fillStyle = "#d9484a";
          ctx.fillRect(-6, -8, 12, 16);
        } else {
          ctx.fillStyle = p.smashed ? "#6b5a3a" : "#2f7d4f";
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      for (const oc of s.cars) {
        if (!vis(oc.x, oc.y)) continue;
        ctx.save();
        ctx.translate(oc.x - camX, oc.y - camY);
        ctx.rotate(oc.angle + (oc.wrecked ? 0.6 : 0));
        ctx.fillStyle = oc.wrecked ? "#5a5a5a" : `hsl(${oc.hue}, 55%, 55%)`;
        ctx.fillRect(-24, -13, 48, 26);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(-6, -11, 14, 22);
        ctx.restore();
      }

      for (const p of s.peds) {
        if (!vis(p.x, p.y)) continue;
        ctx.save();
        ctx.translate(p.x - camX, p.y - camY);
        ctx.rotate(p.rot);
        if (!p.alive) ctx.globalAlpha = 0.85;
        ctx.fillStyle = p.alive ? "#ffe1c4" : "#ffb3b3";
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.alive ? "#3b6ea5" : "#7a3b3b";
        ctx.fillRect(-5, 5, 10, 9);
        ctx.restore();
      }

      for (const d of s.debris) {
        ctx.globalAlpha = Math.max(0, d.life);
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x - camX - 2, d.y - camY - 2, 5, 5);
        ctx.globalAlpha = 1;
      }

      // player car + Vera face
      ctx.save();
      ctx.translate(c.x - camX, c.y - camY);
      ctx.rotate(c.angle);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(-28, -14, 58, 30);
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(-30, -16, 58, 30);
      ctx.fillStyle = "#1c1f24";
      ctx.fillRect(-30, -19, 12, 6);
      ctx.fillRect(-30, 13, 12, 6);
      ctx.fillRect(16, -19, 12, 6);
      ctx.fillRect(16, 13, 12, 6);
      if (face.complete) {
        ctx.save();
        ctx.rotate(-Math.PI / 2);
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(face, -14, -14, 28, 28);
        ctx.restore();
        ctx.strokeStyle = "#0f1115";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      if (playing) {
        setHud((h) => {
          const time = Math.ceil(s.time);
          const faults = s.faults;
          const chaos = Math.round(s.chaos);
          if (h.time === time && h.faults === faults && h.chaos === chaos && h.speech === s.speech) return h;
          return { time, faults, chaos, speech: s.speech };
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const bind = (key: keyof typeof touchRef.current) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      touchRef.current[key] = true;
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      touchRef.current[key] = false;
    },
    onPointerCancel: () => (touchRef.current[key] = false),
    onPointerLeave: () => (touchRef.current[key] = false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const score = hud.chaos;
  const verdict =
    hud.faults > 60 ? "CATASTROPHIC" : hud.faults > 30 ? "SPECTACULARLY BAD" : hud.faults > 10 ? "VERY BAD" : "STILL BAD";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background select-none touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* HUD */}
      {phase === "playing" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-3 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="shrink-0 overflow-hidden rounded-full border-2 border-primary bg-card">
                <img src={veraAsset.url} alt="Vera, the student driver" className="h-12 w-12 object-cover sm:h-14 sm:w-14" />
              </div>
              <div className="min-w-0 rounded-2xl bg-card/85 px-3 py-2 shadow-lg backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Instructor</p>
                <p className="truncate text-sm font-semibold text-foreground sm:text-base">{hud.speech}</p>
              </div>
            </div>
            <div className="shrink-0 rounded-2xl bg-card/85 px-3 py-2 text-right shadow-lg backdrop-blur">
              <p className="font-mono text-2xl font-black text-foreground sm:text-3xl">0:{String(hud.time).padStart(2, "0")}</p>
              <p className="text-xs font-semibold text-destructive">Faults {hud.faults}</p>
              <p className="text-xs font-semibold text-primary">Chaos {hud.chaos}</p>
            </div>
          </div>

          {/* Touch controls */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-6 sm:p-6">
            <div className="flex gap-3">
              <button {...bind("left")} aria-label="Steer left" className="h-20 w-20 rounded-full bg-card/80 text-3xl font-black text-foreground shadow-xl backdrop-blur active:bg-primary active:text-primary-foreground">
                ◀
              </button>
              <button {...bind("right")} aria-label="Steer right" className="h-20 w-20 rounded-full bg-card/80 text-3xl font-black text-foreground shadow-xl backdrop-blur active:bg-primary active:text-primary-foreground">
                ▶
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <button {...bind("brake")} aria-label="Brake" className="h-16 w-20 rounded-2xl bg-card/80 text-sm font-black uppercase text-foreground shadow-xl backdrop-blur active:bg-destructive active:text-destructive-foreground">
                Brake
              </button>
              <button {...bind("gas")} aria-label="Accelerate" className="h-20 w-20 rounded-2xl bg-primary text-sm font-black uppercase text-primary-foreground shadow-xl active:scale-95">
                Gas
              </button>
            </div>
          </div>
          <p className="pointer-events-none absolute bottom-2 left-1/2 hidden -translate-x-1/2 text-xs text-muted-foreground sm:block">
            Keyboard: arrows / WASD
          </p>
        </>
      )}

      {phase !== "playing" && (
        <div className="absolute inset-0 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-2xl sm:p-8">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border-4 border-primary sm:h-28 sm:w-28">
              <img src={veraAsset.url} alt="Vera the student driver" className="h-full w-full object-cover" />
            </div>
            {phase === "intro" ? (
              <>
                <h1 className="mt-5 text-3xl font-black uppercase leading-none tracking-tight text-foreground sm:text-4xl">
                  Vera's Driving Exam
                </h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  60 seconds. One city. Zero talent. Try to pass — you can't. Every pedestrian, bin and parked car you
                  destroy adds Chaos points.
                </p>
                <button
                  onClick={startGame}
                  className="mt-6 w-full rounded-2xl bg-primary px-6 py-4 text-lg font-black uppercase tracking-wide text-primary-foreground transition-transform active:scale-95"
                >
                  Start the exam
                </button>
                <p className="mt-4 text-xs text-muted-foreground">Touch buttons on mobile · arrows / WASD on desktop</p>
              </>
            ) : (
              <>
                <h2 className="mt-5 text-4xl font-black uppercase text-destructive">Failed</h2>
                <p className="mt-1 text-sm font-bold uppercase tracking-widest text-muted-foreground">{verdict}</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-secondary p-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Chaos</p>
                    <p className="text-3xl font-black text-foreground">{score}</p>
                  </div>
                  <div className="rounded-2xl bg-secondary p-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Faults</p>
                    <p className="text-3xl font-black text-destructive">{hud.faults}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm italic text-muted-foreground">
                  "Vera, I'm not angry. I'm relocating." — your instructor
                </p>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">Best chaos: {best}</p>
                <button
                  onClick={startGame}
                  className="mt-5 w-full rounded-2xl bg-primary px-6 py-4 text-lg font-black uppercase tracking-wide text-primary-foreground transition-transform active:scale-95"
                >
                  Retake the exam
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
