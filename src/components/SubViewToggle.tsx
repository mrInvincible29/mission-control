"use client";

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
  return (
    <div className="inline-flex items-center rounded-lg bg-muted/50 p-0.5 text-xs">
      {views.map((view, index) => (
        <button
          key={view.id}
          onClick={() => onChange(view.id)}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5 ${
            active === view.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {view.label}
          <kbd
            className={`hidden sm:inline-flex items-center justify-center rounded border px-1 py-0 text-[9px] font-mono leading-tight ${
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
