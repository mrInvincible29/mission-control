"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface SubView {
  id: string;
  label: string;
}

interface SubViewToggleProps {
  views: SubView[];
  active: string;
  onChange: (id: string) => void;
}

export function SubViewToggle({ views, active, onChange }: SubViewToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const btn = buttonsRef.current.get(active);
    if (!container || !btn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setPill({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }, [active]);

  useEffect(() => {
    measure();
  }, [measure]);

  // Re-measure on resize
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center rounded-lg bg-muted/50 p-0.5 text-xs"
    >
      {/* Sliding pill indicator */}
      {pill && (
        <div
          className="absolute top-0.5 bottom-0.5 rounded-md bg-background shadow-sm transition-all duration-200 ease-out pointer-events-none"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {views.map((view, index) => (
        <button
          key={view.id}
          ref={(el) => {
            if (el) buttonsRef.current.set(view.id, el);
            else buttonsRef.current.delete(view.id);
          }}
          onClick={() => onChange(view.id)}
          className={`relative z-10 rounded-md px-3 py-1.5 font-medium transition-colors duration-200 flex items-center gap-1.5 ${
            active === view.id
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {view.label}
          <kbd
            className={`hidden sm:inline-flex items-center justify-center rounded border px-1 py-0 text-[9px] font-mono leading-tight transition-colors duration-200 ${
              active === view.id
                ? "border-border/40 bg-muted/50 text-muted-foreground/60"
                : "border-transparent text-muted-foreground/30"
            }`}
          >
            ⇧{index + 1}
          </kbd>
        </button>
      ))}
    </div>
  );
}
