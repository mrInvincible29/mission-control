"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import type { SearchResult, IndexedDocument } from "@/types";

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function getFileIcon(filePath: string): string {
  if (filePath.includes("memory/")) return "🧠";
  if (filePath.includes("MEMORY")) return "💭";
  if (filePath.includes("TOOLS")) return "🔧";
  if (filePath.includes("AGENTS")) return "🤖";
  if (filePath.endsWith(".md")) return "📝";
  if (filePath.endsWith(".json")) return "📋";
  return "📄";
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  
  const searchResults = useQuery(
    api.documents.search,
    debouncedQuery.length >= 2 ? { query: debouncedQuery, limit: 20 } : "skip"
  ) as SearchResult[] | undefined;
  const allDocs = useQuery(api.documents.listAll) as IndexedDocument[] | undefined;
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  
  const handleRefreshIndex = async () => {
    setIsIndexing(true);
    try {
      const response = await fetch("/api/index", { method: "POST" });
      if (!response.ok) throw new Error("Failed to index");
    } catch (error) {
      console.error("Indexing failed:", error);
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Global Search</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {allDocs?.length ?? 0} files indexed
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshIndex}
              disabled={isIndexing}
            >
              {isIndexing ? "Indexing..." : "Refresh Index"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Input
            type="search"
            placeholder="Search memory, tools, workspace files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full"
          />
          
          <ScrollArea className="h-[400px]">
            {debouncedQuery.length < 2 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Type at least 2 characters to search
              </div>
            ) : !searchResults ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No results found for &quot;{debouncedQuery}&quot;
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((result: SearchResult) => (
                  <div
                    key={result._id}
                    className="p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{getFileIcon(result.filePath)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {result.fileName}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {result.filePath}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80 mt-1 font-mono text-xs leading-relaxed">
                          {highlightMatch(result.snippet, debouncedQuery)}
                        </p>
                        <div className="text-xs text-muted-foreground mt-1">
                          Indexed: {new Date(result.lastIndexed).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
