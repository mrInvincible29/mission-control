"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Keyboard, X } from "lucide-react";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["1"], description: "Activity tab" },
      { keys: ["2"], description: "Schedule tab" },
      { keys: ["3"], description: "Tasks tab" },
      { keys: ["4"], description: "System tab" },
    ],
  },
  {
    title: "Sub-views",
    shortcuts: [
      { keys: ["\u21e7", "1"], description: "First sub-view" },
      { keys: ["\u21e7", "2"], description: "Second sub-view" },
      { keys: ["\u21e7", "3"], description: "Third sub-view (if available)" },
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

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-[24px] rounded-md border border-border/60 bg-muted/60 px-1.5 text-[11px] font-mono font-medium text-foreground/80 shadow-[0_1px_0_1px_rgba(0,0,0,0.1)]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => setOpen(false), 200);
  }, []);

  const openDialog = useCallback(() => {
    setOpen(true);
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const toggle = useCallback(() => {
    if (open) close();
    else openDialog();
  }, [open, close, openDialog]);

  // Focus the close button when dialog opens
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

  // Listen for the toggle event from the header button
  useEffect(() => {
    const handler = () => toggle();
    window.addEventListener("toggle-shortcuts", handler);
    return () => window.removeEventListener("toggle-shortcuts", handler);
  }, [toggle]);

  // Focus trap — keep Tab cycling within the dialog
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
    <div
      className="fixed inset-0 z-50"
      onClick={close}
    >
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
        className={`absolute left-1/2 top-[15%] w-full max-w-md -translate-x-1/2 rounded-xl border border-border/80 bg-background shadow-2xl overflow-hidden transition-all duration-200 ${
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
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2.5">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-foreground/80">
                      {shortcut.description}
                    </span>
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
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 px-5 py-2.5 flex items-center justify-between text-[10px] text-muted-foreground/60">
          <span>Press <Kbd>?</Kbd> to toggle</span>
          <span>Press <Kbd>Esc</Kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
