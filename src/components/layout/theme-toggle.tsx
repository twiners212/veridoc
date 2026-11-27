"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import gsap from "gsap";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_STORAGE_KEY = "veridoc-theme";
const THEME_EVENT_NAME = "veridoc-theme-change";

interface ViewTransitionLike {
  ready: Promise<void>;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransitionLike;
};

export interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [mounted, setMounted] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const iconRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    const syncFromDom = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");
    };

    syncFromDom();
    setMounted(true);

    window.addEventListener(THEME_EVENT_NAME, syncFromDom);
    return () => window.removeEventListener(THEME_EVENT_NAME, syncFromDom);
  }, []);

  const animateIconMorph = (nextTheme: "light" | "dark") => {
    if (!iconRef.current) return;
    gsap.fromTo(
      iconRef.current,
      {
        rotate: nextTheme === "dark" ? -45 : 45,
        scale: 0.72,
        opacity: 0.35,
      },
      {
        rotate: 0,
        scale: 1,
        opacity: 1,
        duration: 0.36,
        ease: "back.out(1.7)",
        clearProps: "transform,opacity",
      }
    );
  };

  const applyThemeDom = (nextTheme: "light" | "dark") => {
    const root = document.documentElement;
    if (nextTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage quota / private mode restrictions
    }
    setTheme(nextTheme);
    window.dispatchEvent(new CustomEvent(THEME_EVENT_NAME));
  };

  const toggleTheme = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      applyThemeDom(nextTheme);
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    const originX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const originY = rect ? rect.top + rect.height / 2 : 28;
    const maxRadius = Math.hypot(
      Math.max(originX, window.innerWidth - originX),
      Math.max(originY, window.innerHeight - originY)
    );

    const vtDoc = document as ViewTransitionDocument;

    if (typeof vtDoc.startViewTransition === "function") {
      const transition = vtDoc.startViewTransition(() => {
        flushSync(() => {
          applyThemeDom(nextTheme);
        });
      });

      try {
        await transition.ready;
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${originX}px ${originY}px)`,
              `circle(${Math.ceil(maxRadius)}px at ${originX}px ${originY}px)`,
            ],
          },
          {
            duration: 420,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      } catch {
        // Ignore interrupted view transitions (e.g. rapid consecutive clicks)
      }

      animateIconMorph(nextTheme);
      return;
    }

    // Fallback for browsers without View Transitions API: unified GSAP crossfade veil
    const veil = document.createElement("div");
    veil.setAttribute("aria-hidden", "true");
    veil.style.position = "fixed";
    veil.style.inset = "0";
    veil.style.zIndex = "9999";
    veil.style.pointerEvents = "none";
    veil.style.backgroundColor =
      nextTheme === "dark" ? "rgba(244, 247, 251, 0.35)" : "rgba(9, 14, 26, 0.35)";
    document.body.appendChild(veil);

    applyThemeDom(nextTheme);
    animateIconMorph(nextTheme);

    gsap.to(veil, {
      opacity: 0,
      duration: 0.28,
      ease: "power2.out",
      onComplete: () => veil.remove(),
    });
  };

  const isDark = mounted && theme === "dark";

  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid="theme-toggle-button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card/80 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        showLabel
          ? "min-h-[44px] lg:min-h-[36px]"
          : "min-h-[44px] min-w-[44px] lg:h-9 lg:w-9 lg:min-h-0 lg:min-w-0 p-0",
        className
      )}
    >
      <span ref={iconRef} className="inline-flex items-center justify-center">
        {isDark ? (
          <Sun className="h-3.5 w-3.5 text-amber-400" />
        ) : (
          <Moon className="h-3.5 w-3.5 text-indigo-600" />
        )}
      </span>
      {showLabel && <span>{isDark ? "Light" : "Dark"}</span>}
    </button>
  );
}
