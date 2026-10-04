"use client";
import { type ReactNode, useLayoutEffect, useRef } from "react";

/** Reserve the advisor's real height, including choices, before fitting the island. */
export default function WorldStage({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = stage.current!;
    const resize = new ResizeObserver(() => measure());
    const measure = () => {
      const dialogue = el.querySelector<HTMLElement>(".narrator-docked");
      el.style.setProperty(
        "--dialogue-space",
        `${Math.max(76, (dialogue?.getBoundingClientRect().height ?? 0) + 32)}px`,
      );
    };
    const watch = () => {
      resize.disconnect();
      resize.observe(el);
      const dialogue = el.querySelector<HTMLElement>(".narrator-docked");
      if (dialogue) resize.observe(dialogue);
      measure();
    };
    // Phase changes replace the advisor with a quiz, choice or building window.
    const mutations = new MutationObserver(watch);
    mutations.observe(el, { childList: true });
    watch();
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);
  return (
    <div ref={stage} className="content-area world-stage">
      {children}
    </div>
  );
}
