"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect, useMemo } from "react";
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
  if (filePath.includes("SOUL")) return "👻";
  if (filePath.includes("USER")) return "👤";
  if (filePath.includes("HEARTBEAT")) return "💓";
  if (filePath.endsWith(".md")) return "📝";
  if (filePath.endsWith(".json")) return "📋";
  return "📄";
}

function getFolder(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "";
  // Return parent folder name
  return parts[parts.length - 2];
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<IndexedDocument | null>(null);
  const [activeTab, setActiveTab] = useState("browse");
  
  const searchResults = useQuery(
    api.documents.search,
    debouncedQuery.length >= 2 ? { query: debouncedQuery, limit: 20 } : "skip"
  ) as SearchResult[] | undefined;
  const allDocs = useQuery(api.documents.listAll) as IndexedDocument[] | undefined;
  
  // Group files by folder for browse view
  const groupedFiles = useMemo(() => {
    if (!allDocs) return {};
    
    const groups: Record<string, IndexedDocument[]> = {};
    
    for (const doc of allDocs) {
      const folder = getFolder(doc.filePath) || "root";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(doc);
    }
    
    // Sort files within each group by name
    for (const folder of Object.keys(groups)) {
      groups[folder].sort((a, b) => a.fileName.localeCompare(b.fileName));
    }
    
    return groups;
  }, [allDocs]);
  
  // Function to get full document by file path
  const getFullDocument = (filePath: string): IndexedDocument | undefined => {
    return allDocs?.find(doc => doc.filePath === filePath);
  };
  
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
          <CardTitle className="text-lg font-semibold">Files & Search</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {allDocs?.length ?? 0} files
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshIndex}
              disabled={isIndexing}
            >
              {isIndexing ? "Indexing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-[200px]">
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
          </TabsList>
          
          {/* Browse Tab */}
          <TabsContent value="browse" className="mt-4">
            <ScrollArea className="h-[450px] pr-4">
              {!allDocs ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  Loading files...
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedFiles).sort(([a], [b]) => a.localeCompare(b)).map(([folder, files]) => (
                    <div key={folder}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        📁 {folder}
                        <Badge variant="secondary" className="text-xs">{files.length}</Badge>
                      </h3>
                      <div className="space-y-1 ml-2">
                        {files.map((doc) => (
                          <button
                            key={doc._id}
                            className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors flex items-center gap-2"
                            onClick={() => setSelectedFile(doc)}
                          >
                            <span>{getFileIcon(doc.filePath)}</span>
                            <span className="text-sm truncate flex-1">{doc.fileName}</span>
                            <span className="text-xs text-muted-foreground">
                              {(doc.size / 1024).toFixed(1)}KB
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          {/* Search Tab */}
          <TabsContent value="search" className="mt-4 space-y-4">
            <Input
              type="search"
              placeholder="Search memory, tools, workspace files..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full"
            />
            
            <ScrollArea className="h-[400px] pr-4">
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
                      className="p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
                      onClick={() => {
                        const fullDoc = getFullDocument(result.filePath);
                        if (fullDoc) setSelectedFile(fullDoc);
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{getFileIcon(result.filePath)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-sm truncate">
                                {result.fileName}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                const fullDoc = getFullDocument(result.filePath);
                                if (fullDoc) setSelectedFile(fullDoc);
                              }}
                            >
                              View
                            </Button>
                          </div>
                          <p className="text-foreground/80 mt-1 font-mono text-xs leading-relaxed">
                            {highlightMatch(result.snippet, debouncedQuery)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
      
      {/* Full file content dialog */}
      <Dialog open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <span>{selectedFile && getFileIcon(selectedFile.filePath)}</span>
              <span className="truncate">{selectedFile?.fileName}</span>
            </DialogTitle>
            <div className="text-xs text-muted-foreground truncate">
              {selectedFile?.filePath}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-6">
            <pre className="text-sm font-mono whitespace-pre-wrap break-words bg-muted/50 p-4 rounded-lg min-h-full">
              {selectedFile?.content}
            </pre>
          </div>
          <div className="flex justify-between items-center p-4 border-t text-xs text-muted-foreground">
            <span>Size: {selectedFile?.size ? `${(selectedFile.size / 1024).toFixed(1)} KB` : '—'}</span>
            <span>Indexed: {selectedFile?.lastIndexed ? new Date(selectedFile.lastIndexed).toLocaleString() : '—'}</span>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
