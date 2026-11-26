"use client";

import * as React from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, type, disabled, onFocus, onBlur, onMouseEnter, onMouseLeave, ...props },
    forwardedRef
  ) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const isFocusedRef = React.useRef(false);

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const handleMouseEnter = (e: React.MouseEvent<HTMLInputElement>) => {
      if (!disabled && !isFocusedRef.current && !prefersReducedMotion() && innerRef.current) {
        gsap.to(innerRef.current, {
          y: -1,
          duration: 0.16,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLInputElement>) => {
      if (!isFocusedRef.current && !prefersReducedMotion() && innerRef.current) {
        gsap.to(innerRef.current, {
          y: 0,
          duration: 0.18,
          ease: "power2.out",
          overwrite: "auto",
          clearProps: "transform",
        });
      }
      onMouseLeave?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = true;
      if (!disabled && !prefersReducedMotion() && innerRef.current) {
        gsap.to(innerRef.current, {
          y: -1,
          boxShadow: "0 0 0 3px rgba(29, 78, 216, 0.18)",
          duration: 0.2,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = false;
      if (!prefersReducedMotion() && innerRef.current) {
        gsap.to(innerRef.current, {
          y: 0,
          boxShadow: "0 0 0 0px rgba(29, 78, 216, 0)",
          duration: 0.2,
          ease: "power2.out",
          overwrite: "auto",
          clearProps: "transform,boxShadow",
        });
      }
      onBlur?.(e);
    };

    return (
      <input
        type={type}
        disabled={disabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "flex h-9 w-full rounded border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors duration-200 hover:border-primary/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={setRefs}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
