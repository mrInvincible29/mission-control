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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ChevronRight, Copy, Check, Search, X } from "lucide-react";
import type { SearchResult, IndexedDocument } from "@/types";
import { useToast } from "@/components/Toast";

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const splitRegex = new RegExp(`(${escaped})`, "gi");
  const testRegex = new RegExp(`^${escaped}$`, "i");
  const parts = text.split(splitRegex);

  return parts.map((part, i) =>
    testRegex.test(part) ? (
      <mark key={i} className="bg-yellow-400/30 dark:bg-yellow-500/30 text-yellow-700 dark:text-yellow-200 rounded px-0.5">
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
  return parts[parts.length - 2];
}

function getFolderPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SortMode = "name" | "size" | "date";

// --- FileViewerDialog sub-component ---

function FileViewerDialog({
  file,
  onClose,
}: {
  file: IndexedDocument | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => {
    if (!file?.content) return [];
    return file.content.split("\n");
  }, [file]);

  const handleCopy = useCallback(async () => {
    if (!file?.content) return;
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: noop
    }
  }, [file]);

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <span>{file && getFileIcon(file.filePath)}</span>
              <span className="truncate">{file?.fileName}</span>
            </DialogTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? "Copied!" : "Copy to clipboard"}</TooltipContent>
            </Tooltip>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {file?.filePath}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto px-6">
          <table className="w-full text-sm font-mono bg-muted/50 rounded-lg">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-muted/80">
                  <td className="text-right pr-3 pl-3 py-0 text-muted-foreground/50 select-none align-top w-[1%] whitespace-nowrap text-xs">
                    {i + 1}
                  </td>
                  <td className="pr-4 py-0 whitespace-pre-wrap break-words align-top">
                    {line || "\u00A0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center p-4 border-t text-xs text-muted-foreground">
          <span>Size: {file?.size ? `${(file.size / 1024).toFixed(1)} KB` : "—"}</span>
          <span>{lines.length} lines</span>
          <span suppressHydrationWarning>
            Indexed: {file?.lastIndexed ? formatDate(file.lastIndexed) : "—"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Component ---

export function GlobalSearch() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<IndexedDocument | null>(null);
  const [activeTab, setActiveTab] = useState("browse");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useQuery(
    api.documents.search,
    debouncedQuery.length >= 2 ? { query: debouncedQuery, limit: 50 } : "skip"
  ) as SearchResult[] | undefined;
  const allDocs = useQuery(api.documents.listAll) as IndexedDocument[] | undefined;

  // Filename matching: merge content results with filename matches
  const mergedResults = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return undefined;
    if (!searchResults && !allDocs) return undefined;

    const contentResults = searchResults ?? [];
    const contentIds = new Set(contentResults.map(r => r._id));

    const filenameMatches: SearchResult[] = [];
    if (allDocs) {
      const lower = debouncedQuery.toLowerCase();
      for (const doc of allDocs) {
        if (!contentIds.has(doc._id) && doc.fileName.toLowerCase().includes(lower)) {
          filenameMatches.push({
            _id: doc._id,
            filePath: doc.filePath,
            fileName: doc.fileName,
            snippet: doc.content.slice(0, 150) + (doc.content.length > 150 ? "..." : ""),
            lastIndexed: doc.lastIndexed,
          });
        }
      }
    }

    return [...filenameMatches, ...contentResults];
  }, [searchResults, allDocs, debouncedQuery]);

  // Track which results are filename-only matches
  const filenameMatchIds = useMemo(() => {
    if (!mergedResults || !searchResults) return new Set<string>();
    const contentIds = new Set(searchResults.map(r => r._id));
    return new Set(mergedResults.filter(r => !contentIds.has(r._id)).map(r => r._id));
  }, [mergedResults, searchResults]);

  // Sort files within folders
  const sortFiles = useCallback((files: IndexedDocument[]): IndexedDocument[] => {
    return [...files].sort((a, b) => {
      if (sortMode === "size") return b.size - a.size;
      if (sortMode === "date") return b.lastIndexed - a.lastIndexed;
      return a.fileName.localeCompare(b.fileName);
    });
  }, [sortMode]);

  // Group files by folder for browse view
  const groupedFiles = useMemo(() => {
    if (!allDocs) return {};

    const groups: Record<string, IndexedDocument[]> = {};

    for (const doc of allDocs) {
      const folder = getFolder(doc.filePath) || "root";
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(doc);
    }

    for (const folder of Object.keys(groups)) {
      groups[folder] = sortFiles(groups[folder]);
    }

    return groups;
  }, [allDocs, sortFiles]);

  const getFullDocument = (filePath: string): IndexedDocument | undefined => {
    return allDocs?.find(doc => doc.filePath === filePath);
  };

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset selectedIndex when query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [debouncedQuery]);

  // Keyboard shortcuts (Cmd+K now handled by CommandPalette)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow/escape/enter when search tab is active
      if (activeTab !== "search") return;

      if (e.key === "Escape") {
        if (selectedFile) {
          setSelectedFile(null);
        } else if (query) {
          setQuery("");
          setDebouncedQuery("");
        }
        return;
      }

      if (!mergedResults || mergedResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, mergedResults.length - 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        return;
      }

      if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < mergedResults.length) {
        e.preventDefault();
        const result = mergedResults[selectedIndex];
        const fullDoc = getFullDocument(result.filePath);
        if (fullDoc) setSelectedFile(fullDoc);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, query, selectedFile, mergedResults, selectedIndex, allDocs]);

  const handleRefreshIndex = async () => {
    setIsIndexing(true);
    try {
      const response = await fetch("/api/index", { method: "POST" });
      if (!response.ok) throw new Error("Failed to index");
      toast("File index refreshed", "success");
    } catch {
      toast("Indexing failed", "error");
    } finally {
      setIsIndexing(false);
    }
  };

  const resultCount = mergedResults?.length ?? 0;

  return (
    <TooltipProvider>
      <Card className="h-full border-0 shadow-none bg-transparent">
        <CardHeader className="pb-2 px-4 pt-4">
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
        <CardContent className="px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 max-w-[200px]">
              <TabsTrigger value="browse">Browse</TabsTrigger>
              <TabsTrigger value="search">Search</TabsTrigger>
            </TabsList>

            {/* Browse Tab */}
            <TabsContent value="browse" className="mt-4">
              {/* Sort controls */}
              <div className="flex items-center gap-1 mb-3">
                <span className="text-xs text-muted-foreground mr-1">Sort:</span>
                {(["name", "size", "date"] as SortMode[]).map(mode => (
                  <Button
                    key={mode}
                    variant={sortMode === mode ? "secondary" : "ghost"}
                    size="sm"
                    className="text-xs h-6 px-2"
                    onClick={() => setSortMode(mode)}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Button>
                ))}
              </div>

              <ScrollArea className="h-[450px] pr-4">
                {!allDocs ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    Loading files...
                  </div>
                ) : allDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                    <span>No files indexed yet</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshIndex}
                      disabled={isIndexing}
                    >
                      {isIndexing ? "Indexing..." : "Index files now"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(groupedFiles).sort(([a], [b]) => a.localeCompare(b)).map(([folder, files]) => (
                      <Collapsible
                        key={folder}
                        open={!collapsedFolders.has(folder)}
                        onOpenChange={() => toggleFolder(folder)}
                      >
                        <CollapsibleTrigger className="w-full flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors group">
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${!collapsedFolders.has(folder) ? "rotate-90" : ""}`} />
                          <span className="text-sm font-semibold text-muted-foreground">
                            {folder}
                          </span>
                          <Badge variant="secondary" className="text-xs ml-auto">{files.length}</Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-0.5 ml-5 mt-0.5">
                            {files.map((doc) => (
                              <button
                                key={doc._id}
                                className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors flex items-center gap-2"
                                onClick={() => setSelectedFile(doc)}
                              >
                                <span>{getFileIcon(doc.filePath)}</span>
                                <span className="text-sm truncate flex-1">{doc.fileName}</span>
                                <span className="text-[10px] text-muted-foreground/60" suppressHydrationWarning>
                                  {formatDate(doc.lastIndexed)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {(doc.size / 1024).toFixed(1)}KB
                                </span>
                              </button>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Search Tab */}
            <TabsContent value="search" className="mt-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search memory, tools, workspace files..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-8 pr-8"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); setDebouncedQuery(""); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Result count */}
              {debouncedQuery.length >= 2 && mergedResults && (
                <div className="text-xs text-muted-foreground">
                  {resultCount} result{resultCount !== 1 ? "s" : ""} for &quot;{debouncedQuery}&quot;
                </div>
              )}

              <ScrollArea className="h-[400px] pr-4">
                {debouncedQuery.length < 2 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
                    <span>Type at least 2 characters to search</span>
                    <span className="text-xs opacity-60">Tip: Cmd+K to focus search</span>
                  </div>
                ) : !mergedResults ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    Searching...
                  </div>
                ) : mergedResults.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    No results found for &quot;{debouncedQuery}&quot;
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mergedResults.map((result: SearchResult, idx: number) => (
                      <div
                        key={result._id}
                        className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                          idx === selectedIndex
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/50 bg-card/50 hover:bg-card/80"
                        }`}
                        onClick={() => {
                          const fullDoc = getFullDocument(result.filePath);
                          if (fullDoc) setSelectedFile(fullDoc);
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{getFileIcon(result.filePath)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium text-sm truncate">
                                  {result.fileName}
                                </span>
                                {filenameMatchIds.has(result._id) && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">
                                    filename match
                                  </Badge>
                                )}
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
                            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {getFolderPath(result.filePath)}
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

        <FileViewerDialog file={selectedFile} onClose={() => setSelectedFile(null)} />
      </Card>
    </TooltipProvider>
  );
}
