import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Gauge, RotateCcw } from "lucide-react";
import veraAsset from "@/assets/vera.png.asset.json";

type Phase = "intro" | "playing" | "over";
type ObstacleKind = "ped" | "car" | "bin" | "cone";
type Obstacle = {
  id: number;
  kind: ObstacleKind;
  lane: number;
  z: number;
  hit: boolean;
  color: string;
};
type FlyingHit = {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  life: number;
  color: string;
};
type GameState = {
  speed: number;
  lateral: number;
  steer: number;
  distance: number;
  time: number;
  faults: number;
  chaos: number;
  speech: string;
  speechT: number;
  shake: number;
  flash: number;
  crack: number;
  checkpoint: number;
  nextSpawn: number;
  nextId: number;
  obstacles: Obstacle[];
  flying: FlyingHit[];
  last: number;
};

const GAME_TIME = 60;
const DRAW_DISTANCE = 1150;
const COLORS = ["#e64d4d", "#4f9bd8", "#52a96f", "#ef9f32", "#be6cce"];
const FAULT_LINES = [
  "VERA! That person had plans!",
  "The brake is the OTHER pedal!",
  "That bin had a family, Vera.",
  "I am updating my will.",
  "Technically, that was a pavement.",
  "My clipboard just resigned.",
  "Mirrors! Signal! ANYTHING!",
  "That car was already parked!",
  "Please stop collecting pedestrians!",
  "This is an exam, not a demolition derby!",
];
const IDLE_LINES = [
  "Nice and steady... suspiciously steady.",
  "Hands at ten and two. Not one and seven.",
  "The speed limit is not a challenge.",
  "Eyes on the road, Vera. THE ROAD.",
];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function roadCurveAt(distance: number) {
  return Math.sin(distance / 720) * 0.55 + Math.sin(distance / 310) * 0.2;
}

function roadCenterAt(distance: number, z: number) {
  const near = roadCurveAt(distance);
  const far = roadCurveAt(distance + z);
  return (far - near) * z * 0.62;
}

function makeObstacle(id: number, distance: number): Obstacle {
  const roll = Math.random();
  const kind: ObstacleKind = roll < 0.44 ? "ped" : roll < 0.67 ? "car" : roll < 0.84 ? "bin" : "cone";
  return {
    id,
    kind,
    lane: randomBetween(-0.86, 0.86),
    z: distance + randomBetween(650, 1050),
    hit: false,
    color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0],
  };
}

export default function VeraDrivingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef({ left: false, right: false, gas: false, brake: false });
  const phaseRef = useRef<Phase>("intro");
  const [phase, setPhase] = useState<Phase>("intro");
  const [best, setBest] = useState(0);
  const [hud, setHud] = useState({ time: GAME_TIME, faults: 0, chaos: 0, speed: 0, speech: "Try not to kill anyone." });

  useEffect(() => {
    const saved = Number(localStorage.getItem("vera-best") ?? 0);
    if (saved > 0) setBest(saved);
  }, []);

  const startGame = useCallback(() => {
    const initialObstacles = Array.from({ length: 13 }, (_, index) => makeObstacle(index, index * 105));
    stateRef.current = {
      speed: 0,
      lateral: 0,
      steer: 0,
      distance: 0,
      time: GAME_TIME,
      faults: 0,
      chaos: 0,
      speech: "First gear. Nice and gently, Vera.",
      speechT: 3,
      shake: 0,
      flash: 0,
      crack: 0,
      checkpoint: 1,
      nextSpawn: 1200,
      nextId: 20,
      obstacles: initialObstacles,
      flying: [],
      last: performance.now(),
    };
    setHud({ time: GAME_TIME, faults: 0, chaos: 0, speed: 0, speech: "First gear. Nice and gently, Vera." });
    phaseRef.current = "playing";
    setPhase("playing");
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keysRef.current[key] = true;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    };
    const keyUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const face = new Image();
    face.src = veraAsset.url;
    let frame = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const say = (state: GameState, line: string) => {
      state.speech = line;
      state.speechT = 2.6;
    };

    const drawPerson = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string, rotation = 0) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.beginPath();
      ctx.ellipse(0, 14, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#28252e";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-4, 8);
      ctx.lineTo(-8, 20);
      ctx.moveTo(4, 8);
      ctx.lineTo(9, 20);
      ctx.stroke();
      ctx.strokeStyle = "#ffd8b8";
      ctx.beginPath();
      ctx.moveTo(-6, -3);
      ctx.lineTo(-14, 6);
      ctx.moveTo(6, -3);
      ctx.lineTo(14, 4);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-8, -8, 16, 19, 5);
      ctx.fill();
      ctx.fillStyle = "#ffd8b8";
      ctx.beginPath();
      ctx.arc(0, -15, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4c3027";
      ctx.beginPath();
      ctx.arc(0, -17, 7, Math.PI, 0);
      ctx.fill();
      ctx.restore();
    };

    const drawRoadside = (ctx: CanvasRenderingContext2D, width: number, horizon: number, roadBottom: number, state: GameState) => {
      for (let i = 0; i < 22; i++) {
        const worldZ = ((i * 83 - state.distance * 0.65) % 1826 + 1826) % 1826;
        const depth = 1 - worldZ / 1826;
        const eased = depth * depth;
        const y = horizon + eased * (roadBottom - horizon);
        const center = width / 2 + roadCenterAt(state.distance, worldZ) * (1 - depth) - state.lateral * eased * width * 0.2;
        const roadHalf = 28 + eased * width * 0.45;
        const buildingScale = 0.15 + eased * 1.5;
        const side = i % 2 === 0 ? -1 : 1;
        const bx = center + side * (roadHalf + 32 + eased * 100);
        ctx.fillStyle = i % 3 === 0 ? "#c75c4b" : i % 3 === 1 ? "#e1b65a" : "#5b8a91";
        const bw = 50 * buildingScale;
        const bh = (60 + (i % 4) * 14) * buildingScale;
        ctx.fillRect(bx - bw / 2, y - bh, bw, bh);
        ctx.fillStyle = "rgba(255,239,160,.55)";
        const windowSize = Math.max(2, 5 * buildingScale);
        ctx.fillRect(bx - bw * 0.25, y - bh * 0.72, windowSize, windowSize);
        ctx.fillRect(bx + bw * 0.13, y - bh * 0.72, windowSize, windowSize);
        if (i % 3 === 0) {
          ctx.fillStyle = "#39754d";
          ctx.beginPath();
          ctx.arc(center - side * (roadHalf + 13), y - 11 * buildingScale, 13 * buildingScale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawObstacle = (ctx: CanvasRenderingContext2D, obstacle: Obstacle, state: GameState, width: number, horizon: number, roadBottom: number) => {
      const relativeZ = obstacle.z - state.distance;
      if (relativeZ < 0 || relativeZ > DRAW_DISTANCE) return;
      const depth = 1 - relativeZ / DRAW_DISTANCE;
      const eased = depth * depth;
      const y = horizon + eased * (roadBottom - horizon);
      const center = width / 2 + roadCenterAt(state.distance, relativeZ) * (1 - depth) - state.lateral * eased * width * 0.2;
      const roadHalf = 24 + eased * width * 0.43;
      const x = center + obstacle.lane * roadHalf * 0.72;
      const scale = 0.12 + eased * 1.48;
      if (obstacle.kind === "ped") {
        drawPerson(ctx, x, y, scale, obstacle.color);
      } else if (obstacle.kind === "car") {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.beginPath();
        ctx.ellipse(0, 15, 24, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = obstacle.color;
        ctx.beginPath();
        ctx.roundRect(-24, -12, 48, 28, 7);
        ctx.fill();
        ctx.fillStyle = "#bfe5ef";
        ctx.beginPath();
        ctx.roundRect(-15, -25, 30, 17, 5);
        ctx.fill();
        ctx.fillStyle = "#f7e988";
        ctx.fillRect(-19, 8, 8, 5);
        ctx.fillRect(11, 8, 8, 5);
        ctx.restore();
      } else if (obstacle.kind === "bin") {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = "#34745b";
        ctx.beginPath();
        ctx.roundRect(-13, -27, 26, 35, 3);
        ctx.fill();
        ctx.fillStyle = "#223e35";
        ctx.fillRect(-16, -30, 32, 6);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = "#f27632";
        ctx.beginPath();
        ctx.moveTo(0, -27);
        ctx.lineTo(14, 8);
        ctx.lineTo(-14, 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f7f2db";
        ctx.fillRect(-10, -4, 20, 5);
        ctx.restore();
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const state = stateRef.current;
      const playing = phaseRef.current === "playing";
      let delta = state ? Math.min((now - state.last) / 1000, 0.05) : 0;
      if (state) state.last = now;
      if (!playing) delta = 0;

      if (state && playing) {
        const keys = keysRef.current;
        const touch = touchRef.current;
        const gas = Boolean(keys.arrowup || keys.w || touch.gas);
        const brake = Boolean(keys.arrowdown || keys.s || touch.brake);
        const steerInput = (keys.arrowleft || keys.a || touch.left ? -1 : 0) + (keys.arrowright || keys.d || touch.right ? 1 : 0);
        state.steer += (steerInput - state.steer) * Math.min(1, delta * 8);
        if (gas) state.speed += 54 * delta;
        else if (brake) state.speed -= 72 * delta;
        else state.speed *= Math.exp(-0.8 * delta);
        state.speed = Math.max(0, Math.min(145, state.speed));
        state.lateral += state.steer * delta * (0.55 + state.speed / 75);
        state.distance += state.speed * delta * 3.1;
        state.shake = Math.max(0, state.shake - delta * 3.2);
        state.flash = Math.max(0, state.flash - delta * 4.5);
        state.crack = Math.max(0, state.crack - delta * 0.045);

        if (Math.abs(state.lateral) > 1.03 && state.speed > 35) {
          state.lateral = Math.sign(state.lateral) * 1.03;
          state.speed *= 0.67;
          state.shake = 0.8;
          state.faults += 1;
          state.chaos += 15;
          say(state, Math.random() > 0.5 ? "Pavement is not an extra lane!" : "That hedge did nothing to you!");
        } else {
          state.lateral = Math.max(-1.12, Math.min(1.12, state.lateral));
        }

        if (state.distance > state.nextSpawn) {
          for (let index = 0; index < 3; index++) {
            state.obstacles.push(makeObstacle(state.nextId, state.distance + index * 105));
            state.nextId += 1;
          }
          state.nextSpawn = state.distance + randomBetween(380, 580);
        }

        for (const obstacle of state.obstacles) {
          const relativeZ = obstacle.z - state.distance;
          if (!obstacle.hit && relativeZ < 34 && relativeZ > -18 && Math.abs(obstacle.lane - state.lateral * 0.82) < (obstacle.kind === "car" ? 0.34 : 0.25)) {
            obstacle.hit = true;
            const impact = obstacle.kind === "car" ? 250 : obstacle.kind === "ped" ? 100 : 35;
            const faults = obstacle.kind === "car" ? 5 : obstacle.kind === "ped" ? 3 : 1;
            state.chaos += impact;
            state.faults += faults;
            state.shake = obstacle.kind === "car" ? 1.5 : 1;
            state.flash = 1;
            state.crack = Math.min(1, state.crack + (obstacle.kind === "car" ? 0.45 : 0.18));
            state.speed *= obstacle.kind === "car" ? 0.42 : 0.82;
            state.flying.push({
              id: obstacle.id,
              kind: obstacle.kind,
              x: width / 2 + obstacle.lane * width * 0.21,
              y: height * 0.52,
              vx: randomBetween(-180, 180),
              vy: randomBetween(-520, -350),
              rot: 0,
              spin: randomBetween(-8, 8),
              life: 1.35,
              color: obstacle.color,
            });
            say(state, FAULT_LINES[Math.floor(Math.random() * FAULT_LINES.length)] ?? FAULT_LINES[0]);
          }
        }
        state.obstacles = state.obstacles.filter((obstacle) => obstacle.z > state.distance - 100 && !obstacle.hit);

        for (const hit of state.flying) {
          hit.x += hit.vx * delta;
          hit.y += hit.vy * delta;
          hit.vy += 780 * delta;
          hit.rot += hit.spin * delta;
          hit.life -= delta;
        }
        state.flying = state.flying.filter((hit) => hit.life > 0);
        state.speechT -= delta;
        if (state.speechT <= 0) say(state, IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)] ?? IDLE_LINES[0]);

        const newCheckpoint = Math.floor(state.distance / 1500) + 1;
        if (newCheckpoint > state.checkpoint) {
          state.checkpoint = newCheckpoint;
          state.chaos += 150;
          say(state, "Checkpoint! Somehow, we're still moving!");
        }

        state.time -= delta;
        if (state.time <= 0) {
          state.time = 0;
          const score = Math.round(state.chaos);
          const previous = Number(localStorage.getItem("vera-best") ?? 0);
          if (score > previous) {
            localStorage.setItem("vera-best", String(score));
            setBest(score);
          }
          phaseRef.current = "over";
          setPhase("over");
        }
        setHud((current) => {
          const next = {
            time: Math.ceil(state.time),
            faults: state.faults,
            chaos: Math.round(state.chaos),
            speed: Math.round(state.speed),
            speech: state.speech,
          };
          return current.time === next.time && current.faults === next.faults && current.chaos === next.chaos && current.speed === next.speed && current.speech === next.speech ? current : next;
        });
      }

      const activeState = stateRef.current;
      const shakeX = activeState?.shake ? randomBetween(-9, 9) * activeState.shake : 0;
      const shakeY = activeState?.shake ? randomBetween(-6, 6) * activeState.shake : 0;
      context.save();
      context.translate(shakeX, shakeY);
      const horizon = height * 0.25;
      const roadBottom = height * 0.79;
      const stateForDraw = activeState ?? {
        speed: 0, lateral: 0, steer: 0, distance: 0, time: GAME_TIME, faults: 0, chaos: 0, speech: "", speechT: 0,
        shake: 0, flash: 0, crack: 0, checkpoint: 1, nextSpawn: 0, nextId: 0, obstacles: [], flying: [], last: now,
      };

      const sky = context.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#67b9dc");
      sky.addColorStop(1, "#d5eef1");
      context.fillStyle = sky;
      context.fillRect(-20, -20, width + 40, horizon + 30);
      context.fillStyle = "#7caf61";
      context.fillRect(-20, horizon, width + 40, roadBottom - horizon + 20);
      drawRoadside(context, width, horizon, roadBottom, stateForDraw);

      const slices = 68;
      for (let index = 0; index < slices; index++) {
        const nearDepth = index / slices;
        const farDepth = (index + 1) / slices;
        const y1 = horizon + nearDepth * nearDepth * (roadBottom - horizon);
        const y2 = horizon + farDepth * farDepth * (roadBottom - horizon);
        const z1 = DRAW_DISTANCE * (1 - nearDepth);
        const z2 = DRAW_DISTANCE * (1 - farDepth);
        const center1 = width / 2 + roadCenterAt(stateForDraw.distance, z1) * (1 - nearDepth) - stateForDraw.lateral * nearDepth * nearDepth * width * 0.2;
        const center2 = width / 2 + roadCenterAt(stateForDraw.distance, z2) * (1 - farDepth) - stateForDraw.lateral * farDepth * farDepth * width * 0.2;
        const half1 = 25 + nearDepth * nearDepth * width * 0.44;
        const half2 = 25 + farDepth * farDepth * width * 0.44;
        context.fillStyle = index % 2 === 0 ? "#3a3b3f" : "#36373a";
        context.beginPath();
        context.moveTo(center1 - half1, y1);
        context.lineTo(center1 + half1, y1);
        context.lineTo(center2 + half2, y2);
        context.lineTo(center2 - half2, y2);
        context.closePath();
        context.fill();
        context.fillStyle = Math.floor((stateForDraw.distance + z1) / 55) % 2 === 0 ? "#f3eee0" : "#c84b43";
        const curb = Math.max(2, farDepth * 10);
        context.fillRect(center2 - half2 - curb, y2, curb, Math.max(2, y2 - y1 + 1));
        context.fillRect(center2 + half2, y2, curb, Math.max(2, y2 - y1 + 1));
      }

      context.strokeStyle = "rgba(255,245,185,.85)";
      context.lineWidth = 4;
      context.setLineDash([24, 24]);
      for (const lane of [-0.33, 0.33]) {
        context.beginPath();
        for (let step = 0; step <= 28; step++) {
          const depth = step / 28;
          const z = DRAW_DISTANCE * (1 - depth);
          const y = horizon + depth * depth * (roadBottom - horizon);
          const center = width / 2 + roadCenterAt(stateForDraw.distance, z) * (1 - depth) - stateForDraw.lateral * depth * depth * width * 0.2;
          const half = 25 + depth * depth * width * 0.44;
          const x = center + lane * half;
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
      context.setLineDash([]);

      const visible = [...stateForDraw.obstacles].sort((a, b) => b.z - a.z);
      for (const obstacle of visible) drawObstacle(context, obstacle, stateForDraw, width, horizon, roadBottom);

      // Windshield frame, dashboard and Vera's extremely worried mirror portrait.
      context.fillStyle = "#20252a";
      context.beginPath();
      context.moveTo(-20, 0);
      context.lineTo(width * 0.085, 0);
      context.lineTo(width * 0.16, roadBottom);
      context.lineTo(-20, roadBottom + 40);
      context.fill();
      context.beginPath();
      context.moveTo(width + 20, 0);
      context.lineTo(width * 0.915, 0);
      context.lineTo(width * 0.84, roadBottom);
      context.lineTo(width + 20, roadBottom + 40);
      context.fill();
      const dash = context.createLinearGradient(0, roadBottom - 20, 0, height);
      dash.addColorStop(0, "#363d42");
      dash.addColorStop(1, "#15191d");
      context.fillStyle = dash;
      context.beginPath();
      context.moveTo(-20, roadBottom - 12);
      context.quadraticCurveTo(width / 2, roadBottom - 80, width + 20, roadBottom - 12);
      context.lineTo(width + 20, height + 20);
      context.lineTo(-20, height + 20);
      context.closePath();
      context.fill();

      const mirrorW = Math.min(210, width * 0.29);
      const mirrorH = mirrorW * 0.43;
      const mirrorX = width / 2 - mirrorW / 2;
      const mirrorY = 18;
      context.fillStyle = "#181b1e";
      context.beginPath();
      context.roundRect(mirrorX - 7, mirrorY - 7, mirrorW + 14, mirrorH + 14, 14);
      context.fill();
      context.save();
      context.beginPath();
      context.roundRect(mirrorX, mirrorY, mirrorW, mirrorH, 9);
      context.clip();
      context.fillStyle = "#78d9d4";
      context.fillRect(mirrorX, mirrorY, mirrorW, mirrorH);
      if (face.complete && face.naturalWidth > 0) {
        const bob = Math.sin(now / 90) * (activeState?.speed ?? 0) / 90;
        context.drawImage(face, mirrorX + mirrorW * 0.19, mirrorY - mirrorH * 0.35 + bob, mirrorW * 0.62, mirrorH * 1.55);
      }
      if ((activeState?.shake ?? 0) > 0.2) {
        context.fillStyle = "rgba(255,255,255,.9)";
        context.font = `900 ${Math.max(16, mirrorW * 0.11)}px sans-serif`;
        context.textAlign = "right";
        context.fillText("AAAA!", mirrorX + mirrorW - 8, mirrorY + 24);
      }
      context.restore();

      const wheelX = width * 0.34;
      const wheelY = height * 0.91;
      const wheelR = Math.min(92, width * 0.105);
      context.save();
      context.translate(wheelX, wheelY);
      context.rotate(stateForDraw.steer * 0.85);
      context.strokeStyle = "#0d1012";
      context.lineWidth = Math.max(12, wheelR * 0.18);
      context.beginPath();
      context.arc(0, 0, wheelR, 0, Math.PI * 2);
      context.stroke();
      context.lineWidth = 9;
      for (const angle of [0, 2.1, 4.2]) {
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(Math.cos(angle) * wheelR * 0.82, Math.sin(angle) * wheelR * 0.82);
        context.stroke();
      }
      context.fillStyle = "#c6a62f";
      context.beginPath();
      context.arc(0, 0, 20, 0, Math.PI * 2);
      context.fill();
      context.restore();

      for (const hit of stateForDraw.flying) {
        const scale = 1.1 + (1.35 - hit.life) * 0.9;
        if (hit.kind === "ped") drawPerson(context, hit.x, hit.y, scale, hit.color, hit.rot);
        else {
          context.save();
          context.translate(hit.x, hit.y);
          context.rotate(hit.rot);
          context.scale(scale, scale);
          context.fillStyle = hit.kind === "car" ? hit.color : hit.kind === "bin" ? "#34745b" : "#f27632";
          context.beginPath();
          context.roundRect(-22, -14, 44, 28, 5);
          context.fill();
          context.restore();
        }
      }

      if (stateForDraw.crack > 0.05) {
        context.strokeStyle = `rgba(220,240,245,${Math.min(0.75, stateForDraw.crack)})`;
        context.lineWidth = 2;
        const cx = width * 0.72;
        const cy = height * 0.35;
        for (let ray = 0; ray < 8; ray++) {
          const angle = ray * Math.PI / 4 + 0.2;
          context.beginPath();
          context.moveTo(cx, cy);
          context.lineTo(cx + Math.cos(angle) * 95 * stateForDraw.crack, cy + Math.sin(angle) * 95 * stateForDraw.crack);
          context.stroke();
        }
      }
      if (stateForDraw.flash > 0) {
        context.fillStyle = `rgba(255,238,120,${stateForDraw.flash * 0.32})`;
        context.fillRect(0, 0, width, height);
      }
      context.restore();
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const bindControl = (control: keyof typeof touchRef.current) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      touchRef.current[control] = true;
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      touchRef.current[control] = false;
    },
    onPointerCancel: () => { touchRef.current[control] = false; },
    onPointerLeave: () => { touchRef.current[control] = false; },
  });

  const curve = roadCurveAt((stateRef.current?.distance ?? 0) + 540);
  const verdict = hud.faults > 45 ? "PUBLIC TRANSPORT RECOMMENDED" : hud.faults > 20 ? "ABSOLUTELY CATASTROPHIC" : "STILL SOMEHOW TERRIBLE";

  return (
    <main className="relative h-[100dvh] w-full touch-none select-none overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="First-person driving game road view" />

      {phase === "playing" && (
        <>
          <section className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-5" aria-label="Driving exam status">
            <div className="max-w-[58%] border-l-4 border-primary bg-card/90 px-3 py-2 shadow-xl backdrop-blur-sm sm:max-w-md sm:px-4">
              <p className="text-[10px] font-black uppercase text-primary">Terrified instructor</p>
              <p className="line-clamp-2 text-xs font-bold text-card-foreground sm:text-base">{hud.speech}</p>
            </div>
            <div className="grid min-w-24 grid-cols-2 gap-x-3 border-t-4 border-destructive bg-card/90 px-3 py-2 text-right shadow-xl backdrop-blur-sm sm:min-w-36">
              <p className="col-span-2 font-mono text-2xl font-black text-card-foreground sm:text-3xl">0:{String(hud.time).padStart(2, "0")}</p>
              <div><p className="text-[9px] font-bold uppercase text-muted-foreground">Chaos</p><p className="font-black text-primary">{hud.chaos}</p></div>
              <div><p className="text-[9px] font-bold uppercase text-muted-foreground">Faults</p><p className="font-black text-destructive">{hud.faults}</p></div>
            </div>
          </section>

          <div className="pointer-events-none absolute left-1/2 top-[16%] flex -translate-x-1/2 flex-col items-center sm:top-[14%]">
            <div className="grid h-11 w-11 place-items-center border-2 border-primary bg-card/85 shadow-lg backdrop-blur-sm">
              {curve < -0.18 ? <ArrowLeft className="h-7 w-7 text-primary" /> : curve > 0.18 ? <ArrowRight className="h-7 w-7 text-primary" /> : <ArrowUp className="h-7 w-7 text-primary" />}
            </div>
            <span className="mt-1 bg-card/80 px-2 py-0.5 text-[9px] font-black uppercase text-card-foreground">Checkpoint {stateRef.current?.checkpoint ?? 1}</span>
          </div>

          <div className="pointer-events-none absolute bottom-[18%] left-1/2 flex -translate-x-1/2 items-center gap-2 bg-card/85 px-3 py-1.5 text-card-foreground shadow-lg backdrop-blur-sm sm:bottom-6">
            <Gauge className="h-4 w-4 text-primary" />
            <span className="font-mono text-sm font-black">{hud.speed} km/h</span>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3 pb-4 sm:p-6">
            <div className="flex gap-2 sm:gap-3">
              <button {...bindControl("left")} aria-label="Steer left" className="grid h-16 w-16 place-items-center border-2 border-border bg-card/85 text-card-foreground shadow-xl backdrop-blur active:border-primary active:bg-primary active:text-primary-foreground sm:h-20 sm:w-20">
                <ArrowLeft className="h-8 w-8" />
              </button>
              <button {...bindControl("right")} aria-label="Steer right" className="grid h-16 w-16 place-items-center border-2 border-border bg-card/85 text-card-foreground shadow-xl backdrop-blur active:border-primary active:bg-primary active:text-primary-foreground sm:h-20 sm:w-20">
                <ArrowRight className="h-8 w-8" />
              </button>
            </div>
            <div className="flex items-end gap-2 sm:gap-3">
              <button {...bindControl("brake")} aria-label="Brake" className="grid h-14 w-16 place-items-center border-b-4 border-destructive bg-card/90 text-xs font-black uppercase text-card-foreground shadow-xl active:bg-destructive active:text-destructive-foreground sm:h-16 sm:w-20">Brake</button>
              <button {...bindControl("gas")} aria-label="Accelerate" className="grid h-20 w-16 place-items-center border-b-4 border-primary-foreground/30 bg-primary text-xs font-black uppercase text-primary-foreground shadow-xl active:translate-y-1 sm:h-24 sm:w-20">Gas</button>
            </div>
          </div>
        </>
      )}

      {phase !== "playing" && (
        <section className="absolute inset-0 grid place-items-center bg-background/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md border-t-8 border-primary bg-card p-5 text-center shadow-2xl sm:p-8">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border-4 border-primary bg-accent sm:h-28 sm:w-28">
              <img src={veraAsset.url} alt="Vera, the student driver" className="h-full w-full object-cover" />
            </div>
            {phase === "intro" ? (
              <>
                <p className="mt-4 text-xs font-black uppercase text-destructive">One examiner. Zero survival instinct.</p>
                <h1 className="mt-1 text-3xl font-black uppercase leading-none text-card-foreground sm:text-4xl">Vera's Driving Exam</h1>
                <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">Stay on the road, follow the checkpoint arrow and definitely do not collect pedestrians with the windscreen.</p>
                <button onClick={startGame} className="mt-6 flex w-full items-center justify-center gap-2 bg-primary px-6 py-4 text-lg font-black uppercase text-primary-foreground shadow-lg active:translate-y-1">
                  <ArrowUp className="h-5 w-5" /> Start the disaster
                </button>
                <p className="mt-4 text-xs text-muted-foreground">Mobile controls · arrow keys / WASD</p>
              </>
            ) : (
              <>
                <p className="mt-4 text-xs font-black uppercase text-muted-foreground">Official examiner decision</p>
                <h2 className="mt-1 text-5xl font-black uppercase text-destructive">Failed</h2>
                <p className="mt-1 text-sm font-black uppercase text-card-foreground">{verdict}</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="bg-secondary p-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">Chaos</p><p className="text-3xl font-black text-primary">{hud.chaos}</p></div>
                  <div className="bg-secondary p-4"><p className="text-[10px] font-bold uppercase text-muted-foreground">Faults</p><p className="text-3xl font-black text-destructive">{hud.faults}</p></div>
                </div>
                <p className="mt-4 text-sm italic text-muted-foreground">“Vera, I'm not angry. I'm changing careers.” — the examiner</p>
                <p className="mt-2 text-xs font-bold text-muted-foreground">Best chaos: {best}</p>
                <button onClick={startGame} className="mt-5 flex w-full items-center justify-center gap-2 bg-primary px-6 py-4 text-lg font-black uppercase text-primary-foreground shadow-lg active:translate-y-1">
                  <RotateCcw className="h-5 w-5" /> Endanger them again
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}