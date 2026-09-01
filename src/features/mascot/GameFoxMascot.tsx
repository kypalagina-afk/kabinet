import { useEffect, useRef, useState, type CSSProperties } from "react";

export type GameFoxStage = "rest" | "starting" | "working" | "almost" | "complete";

const spriteFrames = Array.from(
  { length: 8 },
  (_, index) => `${import.meta.env.BASE_URL}assets/mascot/fox-idle-v2/frame-${String(index + 1).padStart(2, "0")}.png`,
);

const stageSequences: Record<Exclude<GameFoxStage, "complete">, number[]> = {
  rest: [3, 3, 3, 4, 3, 3, 0, 3],
  starting: [0, 1, 2, 3, 2, 1, 0],
  working: [4, 5, 6, 7, 6, 5, 4, 3],
  almost: [6, 7, 6, 5, 7, 6, 3],
};

const completeImage = `${import.meta.env.BASE_URL}assets/mascot/fox-complete.png`;

export function GameFoxMascot({
  badge,
  label,
  reactionKey,
  stage,
}: {
  badge?: string;
  label: string;
  reactionKey?: string | number;
  stage: GameFoxStage;
}) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const reactionTimerRef = useRef<number | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const lastReactionRef = useRef(reactionKey);
  const [frameCursor, setFrameCursor] = useState(0);
  const sequence = stage === "complete" ? null : stageSequences[stage];
  const spriteIndex = sequence?.[frameCursor % sequence.length] ?? 0;
  const imageSource = stage === "complete"
    ? completeImage
    : spriteFrames[spriteIndex] ?? spriteFrames[0]!;

  function react() {
    const root = rootRef.current;
    if (!root) return;
    root.classList.remove("game-fox--reacting");
    void root.offsetWidth;
    root.classList.add("game-fox--reacting");
    if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = window.setTimeout(
      () => root.classList.remove("game-fox--reacting"),
      900,
    );
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined;
    const handlePointerMove = (event: PointerEvent) => {
      if (pointerFrameRef.current) window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = window.requestAnimationFrame(() => {
        const bounds = root.getBoundingClientRect();
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const lookX = Math.max(-1, Math.min(1, (event.clientX - centerX) / (window.innerWidth * 0.32)));
        const lookY = Math.max(-1, Math.min(1, (event.clientY - centerY) / (window.innerHeight * 0.34)));
        root.style.setProperty("--fox-look-x", lookX.toFixed(3));
        root.style.setProperty("--fox-look-y", lookY.toFixed(3));
      });
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (pointerFrameRef.current) window.cancelAnimationFrame(pointerFrameRef.current);
    };
  }, []);

  useEffect(() => {
    spriteFrames.forEach((source) => {
      const image = new Image();
      image.src = source;
    });
  }, []);

  useEffect(() => {
    if (!sequence || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined;
    const currentFrame = sequence[frameCursor % sequence.length];
    const delay = currentFrame === 3
      ? 170
      : stage === "rest"
        ? 720
        : stage === "almost"
          ? 280
          : 420;
    const timer = window.setTimeout(() => setFrameCursor((current) => current + 1), delay);
    return () => window.clearTimeout(timer);
  }, [frameCursor, sequence, stage]);

  useEffect(() => {
    if (lastReactionRef.current === reactionKey) return;
    lastReactionRef.current = reactionKey;
    react();
  }, [reactionKey]);

  useEffect(() => () => {
    if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
  }, []);

  return (
    <button
      aria-label={`${label}. Нажмите, чтобы погладить лисёнка`}
      className={`game-fox game-fox--${stage}`}
      onClick={react}
      ref={rootRef}
      style={{ "--fox-look-x": "0", "--fox-look-y": "0" } as CSSProperties}
      title="Погладить лисёнка"
      type="button"
    >
      {badge ? <span aria-hidden="true" className="game-fox__badge">{badge}</span> : null}
      <span aria-hidden="true" className="game-fox__shadow" />
      <span aria-hidden="true" className="game-fox__rig">
        <img alt="" className="game-fox__body" draggable={false} src={imageSource} />
      </span>
      <span aria-hidden="true" className="game-fox__sparkles"><i>✦</i><i>★</i><i>✦</i></span>
    </button>
  );
}
