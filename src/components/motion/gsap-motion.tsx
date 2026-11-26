"use client";

import * as React from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

export interface GsapStaggerGroupProps {
  children: React.ReactNode;
  className?: string;
  selector?: string;
  stagger?: number;
  duration?: number;
  yOffset?: number;
  delay?: number;
}

/**
 * Animates matching child elements with a crisp, subtle GSAP entrance.
 * Automatically disables motion when the user prefers reduced motion.
 */
export function GsapStaggerGroup({
  children,
  className,
  selector = "[data-gsap-item]",
  stagger = 0.05,
  duration = 0.35,
  yOffset = 10,
  delay = 0,
}: GsapStaggerGroupProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = el.querySelectorAll(selector);
      if (targets.length === 0) return;

      gsap.from(targets, {
        y: yOffset,
        opacity: 0,
        duration,
        stagger,
        delay,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    });

    return () => mm.revert();
  }, [selector, stagger, duration, yOffset, delay]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}

export interface GsapHoverCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  liftY?: number;
}

/**
 * Adds a restrained -2px GSAP pointer-hover lift while respecting reduced motion.
 */
export function GsapHoverCard({
  children,
  className,
  liftY = -2,
  onMouseEnter,
  onMouseLeave,
  ...props
}: GsapHoverCardProps) {
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const reducedMotionRef = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!reducedMotionRef.current && cardRef.current) {
      gsap.to(cardRef.current, {
        y: liftY,
        duration: 0.2,
        ease: "power2.out",
        overwrite: "auto",
      });
    }
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!reducedMotionRef.current && cardRef.current) {
      gsap.to(cardRef.current, {
        y: 0,
        duration: 0.24,
        ease: "power2.out",
        overwrite: "auto",
        clearProps: "transform",
      });
    }
    onMouseLeave?.(e);
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(className)}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Adds crisp GSAP hover lift (-1.5px) and press scale (0.985) to CTA links or action wrappers.
 */
export function GsapHoverButton({
  children,
  className,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
  onPointerUp,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const reducedMotionRef = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      ref={ref}
      onMouseEnter={(e) => {
        if (!reducedMotionRef.current && ref.current) {
          gsap.to(ref.current, { y: -1.5, duration: 0.18, ease: "power2.out", overwrite: "auto" });
        }
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!reducedMotionRef.current && ref.current) {
          gsap.to(ref.current, {
            y: 0,
            scale: 1,
            duration: 0.2,
            ease: "power2.out",
            overwrite: "auto",
            clearProps: "transform",
          });
        }
        onMouseLeave?.(e);
      }}
      onPointerDown={(e) => {
        if (!reducedMotionRef.current && ref.current) {
          gsap.to(ref.current, { scale: 0.985, duration: 0.1, ease: "power2.out", overwrite: "auto" });
        }
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        if (!reducedMotionRef.current && ref.current) {
          gsap.to(ref.current, { scale: 1, duration: 0.18, ease: "back.out(2)", overwrite: "auto" });
        }
        onPointerUp?.(e);
      }}
      className={cn("inline-flex", className)}
      {...props}
    >
      {children}
    </div>
  );
}
