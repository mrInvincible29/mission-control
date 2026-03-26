"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Keyboard, X, Activity, CalendarDays, CheckSquare, Server, ScrollText, BarChart3, Bot, History, Zap } from "lucide-react";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  icon?: React.ReactNode;
  shortcuts: ShortcutEntry[];
}

// --- Per-view shortcut definitions ---

const VIEW_SHORTCUTS: Record<string, ShortcutGroup> = {
  "activity:feed": {
    title: "Activity Feed",
    icon: <Activity className="h-3 w-3" />,
    shortcuts: [
      { keys: ["J"], description: "Next activity" },
      { keys: ["K"], description: "Previous activity" },
      { keys: ["Esc"], description: "Clear selection" },
    ],
  },
  "activity:analytics": {
    title: "Analytics",
    icon: <BarChart3 className="h-3 w-3" />,
    shortcuts: [
      { keys: ["["], description: "Previous time range" },
      { keys: ["]"], description: "Next time range" },
    ],
  },
  "activity:agents": {
    title: "Agent Sessions",
    icon: <Bot className="h-3 w-3" />,
    shortcuts: [
      { keys: ["J"], description: "Next session" },
      { keys: ["K"], description: "Previous session" },
      { keys: ["\u21b5"], description: "Select session" },
      { keys: ["Esc"], description: "Deselect" },
    ],
  },
  "schedule:calendar": {
    title: "Calendar",
    icon: <CalendarDays className="h-3 w-3" />,
    shortcuts: [
      { keys: ["J"], description: "Previous day/week" },
      { keys: ["K"], description: "Next day/week" },
      { keys: ["T"], description: "Go to today" },
      { keys: ["D"], description: "Day view" },
      { keys: ["W"], description: "Week view" },
      { keys: ["N"], description: "Scroll to now" },
      { keys: ["C"], description: "Create event" },
    ],
  },
  "schedule:runs": {
    title: "Run History",
    icon: <History className="h-3 w-3" />,
    shortcuts: [
      { keys: ["J"], description: "Next job" },
      { keys: ["K"], description: "Previous job" },
      { keys: ["\u21b5"], description: "Expand/collapse" },
      { keys: ["/"], description: "Focus search" },
    ],
  },
  "tasks:board": {
    title: "Kanban Board",
    icon: <CheckSquare className="h-3 w-3" />,
    shortcuts: [
      { keys: ["N"], description: "New task" },
      { keys: ["/"], description: "Focus search" },
      { keys: ["J"], description: "Next card" },
      { keys: ["K"], description: "Previous card" },
      { keys: ["\u21b5"], description: "Open card detail" },
      { keys: ["Esc"], description: "Close detail / clear focus" },
    ],
  },
  "system:health": {
    title: "System Health",
    icon: <Server className="h-3 w-3" />,
    shortcuts: [
      { keys: ["E"], description: "Expand all sections" },
      { keys: ["C"], description: "Collapse all sections" },
    ],
  },
  "system:logs": {
    title: "Log Viewer",
    icon: <ScrollText className="h-3 w-3" />,
    shortcuts: [
      { keys: ["N"], description: "Next log level" },
      { keys: ["\u21e7", "N"], description: "Previous log level" },
      { keys: ["/"], description: "Focus search" },
      { keys: ["\u21b5"], description: "Next search match" },
      { keys: ["\u21e7", "\u21b5"], description: "Previous match" },
      { keys: ["Esc"], description: "Clear filter/search" },
    ],
  },
  "system:services": {
    title: "Services",
    icon: <Zap className="h-3 w-3" />,
    shortcuts: [],
  },
};

const GLOBAL_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["1"], description: "Activity tab" },
      { keys: ["2"], description: "Schedule tab" },
      { keys: ["3"], description: "Tasks tab" },
      { keys: ["4"], description: "System tab" },
      { keys: ["\u21e7", "1\u20133"], description: "Switch sub-view" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["\u2318", "K"], description: "Command palette" },
      { keys: ["R"], description: "Refresh current view" },
      { keys: ["?"], description: "Toggle this help" },
    ],
  },
];

// --- Default views per tab ---
const DEFAULT_VIEWS: Record<string, string> = {
  activity: "feed",
  schedule: "calendar",
  tasks: "board",
  system: "health",
};

const TAB_LABELS: Record<string, string> = {
  activity: "Activity",
  schedule: "Schedule",
  tasks: "Tasks",
  system: "System",
};

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-[24px] rounded-md border border-border/60 bg-muted/60 px-1.5 text-[11px] font-mono font-medium text-foreground/80 shadow-[0_1px_0_1px_rgba(0,0,0,0.1)]">
      {children}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutEntry }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground/80">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, ki) => (
          <span key={ki} className="flex items-center gap-0.5">
            {ki > 0 && (
              <span className="text-[10px] text-muted-foreground/40 mx-0.5">+</span>
            )}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchParams = useSearchParams();

  // Derive current view from URL
  const currentTab = searchParams.get("tab") || "activity";
  const currentView = searchParams.get("view") || DEFAULT_VIEWS[currentTab] || "feed";
  const viewKey = `${currentTab}:${currentView}`;

  const viewGroup = useMemo(() => VIEW_SHORTCUTS[viewKey], [viewKey]);
  const tabLabel = TAB_LABELS[currentTab] || currentTab;

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => setOpen(false), 200);
  }, []);

  const openDialog = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const toggle = useCallback(() => {
    if (open) close();
    else openDialog();
  }, [open, close, openDialog]);

  // Focus close button when dialog opens
  useEffect(() => {
    if (open && visible) {
      closeButtonRef.current?.focus();
    }
  }, [open, visible]);

  // ? key to toggle, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
        return;
      }
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle, close, open]);

  // Listen for toggle event from header button
  useEffect(() => {
    const handler = () => toggle();
    window.addEventListener("toggle-shortcuts", handler);
    return () => window.removeEventListener("toggle-shortcuts", handler);
  }, [toggle]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleTab);
    return () => window.removeEventListener("keydown", handleTab);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={close}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className={`absolute left-1/2 top-[12%] w-full max-w-md -translate-x-1/2 rounded-xl border border-border/80 bg-background shadow-2xl overflow-hidden transition-all duration-200 ${
          visible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 -translate-y-2"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={close}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Close shortcuts help"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto" data-testid="shortcuts-content">
          {/* Current view shortcuts (highlighted) */}
          {viewGroup && viewGroup.shortcuts.length > 0 && (
            <div
              className="rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 transition-all duration-200"
              data-testid="view-shortcuts"
            >
              <h3 className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                {viewGroup.icon}
                {viewGroup.title}
                <span className="text-[9px] font-normal normal-case tracking-normal text-muted-foreground/60 ml-1">
                  current view
                </span>
              </h3>
              <div className="space-y-1.5">
                {viewGroup.shortcuts.map((shortcut, i) => (
                  <ShortcutRow key={i} shortcut={shortcut} />
                ))}
              </div>
            </div>
          )}

          {/* Global shortcut groups */}
          {GLOBAL_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2.5">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut, i) => (
                  <ShortcutRow key={i} shortcut={shortcut} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 px-5 py-2.5 flex items-center justify-between text-[10px] text-muted-foreground/60">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary/70 px-1.5 py-0.5 text-[9px] font-medium">
              {tabLabel} &rsaquo; {viewGroup?.title || currentView}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span>Press <Kbd>?</Kbd> to toggle</span>
            <span>Press <Kbd>Esc</Kbd> to close</span>
          </span>
        </div>
      </div>
    </div>
  );
}
