"use client";

import { useEffect, useRef } from "react";
import { useHealthData } from "@/hooks/useHealthData";

const STATUS_COLORS: Record<string, string> = {
  ok: "#10b981",
  warn: "#f59e0b",
  critical: "#ef4444",
};

/**
 * DynamicFavicon — generates a canvas-based favicon that shows system health
 * as a colored dot (green/amber/red). Updates whenever health status changes.
 * Renders nothing visible — just manages the <link rel="icon"> element.
 */
export function DynamicFavicon() {
  const { healthStatus } = useHealthData();
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!healthStatus || healthStatus === prevStatusRef.current) return;
    prevStatusRef.current = healthStatus;

    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background circle — dark base
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // Inner ring — subtle border
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();

    // Status dot — colored center
    const color = STATUS_COLORS[healthStatus] || "#6b7280";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 9, 0, Math.PI * 2);
    ctx.fill();

    // Glow effect for warn/critical
    if (healthStatus !== "ok") {
      ctx.fillStyle = color + "40"; // 25% opacity
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 13, 0, Math.PI * 2);
      ctx.fill();
      // Redraw inner dot on top of glow
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight — tiny white reflection dot
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(size / 2 - 3, size / 2 - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Update or create the favicon link element
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      document.head.appendChild(link);
    }
    link.href = canvas.toDataURL("image/png");
  }, [healthStatus]);

  return null;
}
