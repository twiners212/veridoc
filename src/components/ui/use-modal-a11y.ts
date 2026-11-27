"use client";

import * as React from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.hasAttribute("hidden") || el.closest("[hidden]")) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    }
  );
}

export interface UseModalA11yOptions<T extends HTMLElement = HTMLElement> {
  isOpen: boolean;
  onClose?: () => void;
  disabled?: boolean;
  containerRef: React.RefObject<T | null>;
}

/**
 * Provides Escape-to-close, initial focus, Tab/Shift+Tab focus trapping,
 * and focus restoration for custom dialog overlays.
 */
export function useModalA11y<T extends HTMLElement = HTMLElement>({
  isOpen,
  onClose,
  disabled = false,
  containerRef,
}: UseModalA11yOptions<T>): void {
  const onCloseRef = React.useRef(onClose);
  const disabledRef = React.useRef(disabled);
  const previousFocusedRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  React.useEffect(() => {
    if (!isOpen) return;

    previousFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (container && !container.contains(document.activeElement)) {
      const focusables = getFocusableElements(container);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        if (!container.hasAttribute("tabindex")) {
          container.setAttribute("tabindex", "-1");
        }
        container.focus();
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!disabledRef.current && onCloseRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (event.key === "Tab") {
        const activeContainer = containerRef.current;
        if (!activeContainer) return;

        const focusables = getFocusableElements(activeContainer);
        if (focusables.length === 0) {
          event.preventDefault();
          activeContainer.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !activeContainer.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !activeContainer.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const prev = previousFocusedRef.current;
      previousFocusedRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [isOpen, containerRef]);
}
