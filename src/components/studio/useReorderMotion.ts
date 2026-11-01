"use client";
import { useEffect, useLayoutEffect, useRef } from "react";

const useVisualLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;
type Position = { x: number; y: number };
const measure = (root: HTMLElement | null) => {
  if (!root) return null;
  const origin = root.getBoundingClientRect();
  const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-reorder-key]"));
  const positions = new Map(elements.map(el => {
    const rect = el.getBoundingClientRect();
    return [el.dataset.reorderKey!, { x: rect.left - origin.left, y: rect.top - origin.top }] as const;
  }));
  return { elements, positions, order: JSON.stringify(elements.map(el => el.dataset.reorderKey)) };
};

/** Animate existing DOM cards after their order changes; never writes project data. */
export function useReorderMotion<T extends HTMLElement>(view: string) {
  const ref = useRef<T>(null);
  const previous = useRef<{ view: string; order: string; positions: Map<string, Position> }>();
  const animations = useRef<Animation[]>([]);
  useVisualLayout(() => {
    const next = measure(ref.current);
    if (!next) return;
    const old = previous.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.efectos === "reducidos";
    if (old?.view === view && old.order !== next.order && !reduced) {
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
      for (const el of next.elements) {
        const key = el.dataset.reorderKey!;
        const before = old.positions.get(key), after = next.positions.get(key);
        if (!before || !after || typeof el.animate !== "function") continue;
        const x = before.x - after.x, y = before.y - after.y;
        if (Math.abs(x) + Math.abs(y) < 1 || Math.abs(x) + Math.abs(y) > 1800) continue;
        animations.current.push(el.animate([
          { transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" },
        ], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }));
      }
    }
    previous.current = { view, order: next.order, positions: next.positions };
  });
  useEffect(() => {
    const root = ref.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const refresh = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = measure(ref.current);
        if (next && previous.current) previous.current = { ...previous.current, order: next.order, positions: next.positions };
      });
    };
    const stop = () => {
      if (media.matches || document.documentElement.dataset.efectos === "reducidos") animations.current.forEach(animation => animation.cancel());
    };
    const observer = new MutationObserver(stop);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-efectos"] });
    root?.addEventListener("scroll", refresh, { capture: true, passive: true });
    window.addEventListener("resize", refresh, { passive: true });
    media.addEventListener("change", stop);
    return () => {
      root?.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
      media.removeEventListener("change", stop);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      animations.current.forEach(animation => animation.cancel());
    };
  }, []);
  return ref;
}

/** Presentation identity only: short scenes still use their existing numeric data contract. */
export function shortSceneVisualKeys(scenes: { speaker?: string; line?: string; title?: string; location?: string }[]) {
  const occurrences = new Map<string, number>();
  return scenes.map(scene => {
    const identity = JSON.stringify([scene.speaker, scene.line, scene.title, scene.location]);
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    return `${identity}:${occurrence}`;
  });
}
