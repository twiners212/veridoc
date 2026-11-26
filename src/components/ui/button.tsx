"use client";

import * as React from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      disabled,
      onMouseEnter,
      onMouseLeave,
      onPointerDown,
      onPointerUp,
      ...props
    },
    forwardedRef
  ) => {
    const innerRef = React.useRef<HTMLButtonElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLButtonElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled && variant !== "link" && !prefersReducedMotion() && innerRef.current) {
        gsap.to(innerRef.current, {
          y: -1.5,
          duration: 0.18,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!prefersReducedMotion() && innerRef.current) {
        gsap.to(innerRef.current, {
          y: 0,
          scale: 1,
          duration: 0.2,
          ease: "power2.out",
          overwrite: "auto",
          clearProps: "transform",
        });
      }
      onMouseLeave?.(e);
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!disabled && variant !== "link" && !prefersReducedMotion() && innerRef.current) {
        gsap.to(innerRef.current, {
          scale: 0.985,
          duration: 0.1,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
      onPointerDown?.(e);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!disabled && variant !== "link" && !prefersReducedMotion() && innerRef.current) {
        gsap.to(innerRef.current, {
          scale: 1,
          duration: 0.18,
          ease: "back.out(2)",
          overwrite: "auto",
        });
      }
      onPointerUp?.(e);
    };

    return (
      <button
        disabled={disabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-brand-gradient text-white hover:opacity-95 shadow-sm shadow-blue-700/20 dark:shadow-blue-950/40":
              variant === "default",
            "bg-destructive text-destructive-foreground hover:bg-red-800 shadow-sm":
              variant === "destructive",
            "border border-border bg-card/80 hover:bg-muted hover:border-primary/40 text-foreground shadow-xs":
              variant === "outline",
            "bg-secondary text-secondary-foreground hover:bg-secondary/80":
              variant === "secondary",
            "hover:bg-muted text-foreground": variant === "ghost",
            "text-primary underline-offset-4 hover:underline": variant === "link",
          },
          {
            "h-9 px-4 py-2 text-sm": size === "default",
            "h-8 rounded px-3 text-xs": size === "sm",
            "h-11 rounded px-8 text-base": size === "lg",
            "h-9 w-9": size === "icon",
          },
          className
        )}
        ref={setRefs}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
