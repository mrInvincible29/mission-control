"use client";

import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { X } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextType {
  toast: (message: string, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

const TOAST_DURATION = 4000;
const EXIT_DURATION = 300;
const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exiting, setExiting] = useState<Set<number>>(new Set());

  const startExit = useCallback((id: number) => {
    setExiting(prev => new Set(prev).add(id));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      setExiting(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, EXIT_DURATION);
  }, []);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = nextId++;
    setToasts(prev => {
      const next = [...prev, { id, message, type }];
      // Limit max visible toasts
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });
    setTimeout(() => startExit(id), TOAST_DURATION);
  }, [startExit]);

  const removeToast = useCallback((id: number) => {
    startExit(id);
  }, [startExit]);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={removeToast} isExiting={exiting.has(t.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss, isExiting }: { toast: Toast; onDismiss: (id: number) => void; isExiting: boolean }) {
  const [entered, setEntered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => setEntered(true), 10);
    return () => clearTimeout(timerRef.current);
  }, []);

  const colorMap = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    error: "border-red-500/40 bg-red-500/10 text-red-300",
    info: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  };

  const visible = entered && !isExiting;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border backdrop-blur-sm shadow-lg transition-all duration-300 ${
        colorMap[toast.type]
      } ${visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95"}`}
    >
      <span className="text-sm flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
