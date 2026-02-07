"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  
  const client = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);
  
  if (!client) {
    // Render children without Convex provider when not configured
    return <>{children}</>;
  }
  
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
