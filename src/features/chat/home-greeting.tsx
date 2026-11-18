"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { homeGreetings } from "./home-greetings";

function subscribeMotion(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

export function HomeGreeting({ paused }: { paused: boolean }) {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "visible",
    () => false,
  );
  const [text, setText] = useState({ index: 0, count: 0, fading: false });
  const phrase = homeGreetings[text.index];
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setText({
          index: Math.floor(Math.random() * homeGreetings.length),
          count: 0,
          fading: false,
        }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (paused || hidden || reduced) {
      if (text.count === phrase.length && !text.fading) return;
      const timer = window.setTimeout(
        () =>
          setText((current) => ({
            ...current,
            count: homeGreetings[current.index].length,
            fading: false,
          })),
        0,
      );
      return () => window.clearTimeout(timer);
    }
    const typing = text.count < phrase.length;
    const timer = window.setTimeout(
      () => {
        setText((current) =>
          typing
            ? { ...current, count: current.count + 1 }
            : !current.fading
              ? { ...current, fading: true }
              : {
                  index:
                    (current.index +
                      1 +
                      Math.floor(Math.random() * (homeGreetings.length - 1))) %
                    homeGreetings.length,
                  count: 0,
                  fading: false,
                },
        );
      },
      typing ? 50 : text.fading ? 180 : 13500,
    );
    return () => window.clearTimeout(timer);
  }, [text, phrase, paused, hidden, reduced]);
  return (
    <h1 className="ia-greeting" aria-live="off">
      <span className="ia-sr">{phrase}</span>
      <span className="ia-greeting-size" aria-hidden="true">
        {homeGreetings.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </span>
      <span
        className={`ia-greeting-typed${text.fading ? " is-fading" : ""}`}
        aria-hidden="true"
      >
        {phrase.slice(0, text.count)}
        {text.count < phrase.length && !paused && !hidden && !reduced ? (
          <span className="ia-greeting-cursor" />
        ) : null}
      </span>
      <span className="ia-greeting-reduced" aria-hidden="true">
        {phrase}
      </span>
    </h1>
  );
}
