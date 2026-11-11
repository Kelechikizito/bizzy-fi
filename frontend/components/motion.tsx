"use client";
// Small motion pieces: reveal on scroll, count-up numbers. All of it stops for people who ask for reduced motion.
import { animate, MotionConfig, motion, useInView } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";

/** One easing for the whole site: quick start, soft landing. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Turns animations off site-wide when the device asks for reduced motion. */
export const MotionRoot = ({ children }: { children: ReactNode }) => <MotionConfig reducedMotion="user">{children}</MotionConfig>;

/** Fades and lifts its content in once, the first time it scrolls into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Counts the leading number of `value` up from 0 when it comes into view ("1.35 NEAR", "100%", 26); text without a number shows as is. */
export function CountUp({ value }: { value: string | number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const text = String(value);
  const match = text.match(/^(\d+(?:\.\d+)?)(.*)$/);

  useEffect(() => {
    if (!match || !inView || !ref.current) return;
    const target = Number(match[1]);
    const decimals = match[1].split(".")[1]?.length ?? 0;
    const node = ref.current;
    const controls = animate(0, target, {
      duration: 0.9,
      ease: EASE,
      onUpdate: (v) => (node.textContent = `${v.toFixed(decimals)}${match[2]}`),
    });
    return () => controls.stop();
  }, [inView, text]); // eslint-disable-line react-hooks/exhaustive-deps

  return <span ref={ref}>{text}</span>;
}
