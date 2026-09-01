import { useEffect, useRef, type CSSProperties } from "react";

export type GameFoxStage = "rest" | "starting" | "working" | "almost" | "complete";

const stageImages: Record<GameFoxStage, string> = {
  rest: `${import.meta.env.BASE_URL}assets/mascot/fox-rig-base.png`,
  starting: `${import.meta.env.BASE_URL}assets/mascot/fox-starting.png`,
  working: `${import.meta.env.BASE_URL}assets/mascot/fox-working.png`,
  almost: `${import.meta.env.BASE_URL}assets/mascot/fox-almost.png`,
  complete: `${import.meta.env.BASE_URL}assets/mascot/fox-complete.png`,
};

const closedEyesImage = `${import.meta.env.BASE_URL}assets/mascot/fox-rig-base.png`;

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
  const blinkTimerRef = useRef<number | null>(null);
  const reactionTimerRef = useRef<number | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const lastReactionRef = useRef(reactionKey);

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
    const root = rootRef.current;
    if (!root || stage === "rest" || stage === "complete" || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined;
    let cancelled = false;
    const scheduleBlink = () => {
      blinkTimerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        root.classList.add("game-fox--blinking");
        window.setTimeout(() => root.classList.remove("game-fox--blinking"), 150);
        scheduleBlink();
      }, 2_600 + Math.round(Math.random() * 3_400));
    };
    scheduleBlink();
    return () => {
      cancelled = true;
      if (blinkTimerRef.current) window.clearTimeout(blinkTimerRef.current);
      root.classList.remove("game-fox--blinking");
    };
  }, [stage]);

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
        <img alt="" className="game-fox__body" draggable={false} src={stageImages[stage]} />
        <span className="game-fox__ear game-fox__ear--left">
          <img alt="" draggable={false} src={stageImages[stage]} />
        </span>
        <span className="game-fox__ear game-fox__ear--right">
          <img alt="" draggable={false} src={stageImages[stage]} />
        </span>
        <img alt="" className="game-fox__blink" draggable={false} src={closedEyesImage} />
      </span>
      <span aria-hidden="true" className="game-fox__sparkles"><i>✦</i><i>★</i><i>✦</i></span>
    </button>
  );
}
