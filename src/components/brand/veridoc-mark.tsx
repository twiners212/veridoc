import * as React from "react";
import { cn } from "@/lib/utils";

export interface VeriDocMarkProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "tile" | "plain";
}

export function VeriDocMark({
  className,
  size = "md",
  variant = "tile",
}: VeriDocMarkProps) {
  const id = React.useId().replace(/:/g, "");
  const grad1 = `vd-s1-${id}`;
  const grad2 = `vd-s2-${id}`;

  const dims = {
    sm: "h-7 w-7",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  }[size];

  if (variant === "plain") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        role="img"
        aria-label="VeriDoc DualCheck Logo"
        className={cn(dims, "shrink-0", className)}
      >
        <defs>
          <linearGradient id={grad1} gradientUnits="userSpaceOnUse" x1="19" y1="48" x2="180" y2="200">
            <stop offset="0%" stopColor="#1D4ED8" />
            <stop offset="100%" stopColor="#4F46E5" />
          </linearGradient>
          <linearGradient id={grad2} gradientUnits="userSpaceOnUse" x1="149" y1="200" x2="237" y2="96">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="100%" stopColor="#0284C7" />
          </linearGradient>
        </defs>
        <path fill={`url(#${grad1})`} d="M 19 60 H 63 L 107 148 L 157 48 H 201 L 125 200 H 89 Z" />
        <path fill={`url(#${grad2})`} d="M 149 200 L 201 96 H 237 L 185 200 Z" />
      </svg>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-brand-gradient p-1.5 text-white shadow-sm shadow-blue-700/25",
        dims,
        className
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        role="img"
        aria-label="VeriDoc DualCheck Logo"
        className="h-full w-full"
      >
        <path fill="currentColor" d="M 12 56 H 62 L 104 140 L 146 56 H 196 L 122 204 H 86 Z" />
        <path fill="currentColor" fillOpacity="0.88" d="M 150 204 L 202 100 H 244 L 192 204 Z" />
      </svg>
    </div>
  );
}
