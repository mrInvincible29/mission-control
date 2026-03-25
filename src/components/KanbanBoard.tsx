"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import useSWR from "swr";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { generateKeyBetween } from "fractional-indexing";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  GripVertical,
  Trash2,
  User,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  Loader2,
  MessageSquare,
  Timer,
  Clock,
  Search,
  X,
  TrendingUp,
  BarChart3,
  Hourglass,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { formatRelativeTime } from "@/lib/formatters";
import type { Task, TaskStatus, TaskPriority, Assignee } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-blue-500",
  low: "border-l-gray-400",
};

const PRIORITY_BADGE_COLORS: Record<TaskPriority, string> = {
  urgent: "bg-red-500/10 text-red-500",
  high: "bg-orange-500/10 text-orange-500",
  medium: "bg-blue-500/10 text-blue-500",
  low: "bg-gray-500/10 text-gray-500",
};

const COLUMNS: {
  id: TaskStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: "todo",
    label: "To Do",
    icon: <ListTodo className="h-4 w-4" />,
    color: "text-gray-500",
  },
  {
    id: "in_progress",
    label: "In Progress",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-blue-500",
  },
  {
    id: "blocked",
    label: "Blocked",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "text-amber-500",
  },
  {
    id: "done",
    label: "Done",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-emerald-500",
  },
];

const ASSIGNEE_COLORS: Record<string, string> = {
  aj: "bg-purple-500/20 text-purple-400",
  bot: "bg-blue-500/20 text-blue-400",
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  cron: <Timer className="h-3 w-3 text-muted-foreground" />,
  telegram: <MessageSquare className="h-3 w-3 text-muted-foreground" />,
};

function getInitials(displayName: string): string {
  return displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function isStale(task: Task): boolean {
  if (task.status !== "blocked" && task.status !== "in_progress") return false;
  return Date.now() - task.updatedAt > STALE_THRESHOLD_MS;
}

const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];
const PRIORITY_BAR_COLORS: Record<TaskPriority, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-gray-400",
};

// ---------------------------------------------------------------------------
// TaskAgeBadge — visual indicator of how long a task has been in current status
// ---------------------------------------------------------------------------

function TaskAgeBadge({ task }: { task: Task }) {
  const age = Date.now() - task.updatedAt;
  if (task.status === "done") return null;

  // Under 1h: no badge (fresh)
  if (age < ONE_HOUR_MS) return null;

  let label: string;
  let colorClass: string;

  if (age < ONE_DAY_MS) {
    const hours = Math.floor(age / ONE_HOUR_MS);
    label = `${hours}h`;
    colorClass = "bg-emerald-500/15 text-emerald-400";
  } else if (age < 3 * ONE_DAY_MS) {
    const days = Math.floor(age / ONE_DAY_MS);
    label = `${days}d`;
    colorClass = "bg-blue-500/15 text-blue-400";
  } else if (age < 7 * ONE_DAY_MS) {
    const days = Math.floor(age / ONE_DAY_MS);
    label = `${days}d`;
    colorClass = "bg-amber-500/15 text-amber-400";
  } else {
    const days = Math.floor(age / ONE_DAY_MS);
    label = `${days}d`;
    colorClass = "bg-red-500/15 text-red-400";
  }

  return (
    <span
      className={`text-[9px] font-mono px-1 py-0.5 rounded ${colorClass}`}
      title={`In current status for ${label}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SummaryStrip — glanceable task stats
// ---------------------------------------------------------------------------

function SummaryStrip({ tasks }: { tasks: Task[] }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const stale = tasks.filter(isStale).length;

  // Completion rate
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  // Average age of active tasks (not done)
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const avgAge = activeTasks.length > 0
    ? activeTasks.reduce((sum, t) => sum + (Date.now() - t.updatedAt), 0) / activeTasks.length
    : 0;

  function formatAge(ms: number): string {
    if (ms < ONE_HOUR_MS) return "<1h";
    if (ms < ONE_DAY_MS) return `${Math.floor(ms / ONE_HOUR_MS)}h`;
    return `${Math.floor(ms / ONE_DAY_MS)}d`;
  }

  // Recently completed (last 24h)
  const recentlyDone = tasks.filter(
    (t) => t.status === "done" && t.completedAt && Date.now() - t.completedAt < ONE_DAY_MS
  ).length;

  if (total === 0) return null;

  const stats = [
    { icon: <BarChart3 className="h-3 w-3" />, label: "Total", value: String(total), color: "text-foreground/70" },
    { icon: <TrendingUp className="h-3 w-3" />, label: "Done", value: `${completionRate}%`, color: completionRate >= 50 ? "text-emerald-400" : "text-foreground/70" },
    { icon: <Loader2 className="h-3 w-3" />, label: "Active", value: String(inProgress), color: inProgress > 0 ? "text-blue-400" : "text-foreground/70" },
    ...(blocked > 0 ? [{ icon: <AlertTriangle className="h-3 w-3" />, label: "Blocked", value: String(blocked), color: "text-amber-400" }] : []),
    ...(stale > 0 ? [{ icon: <Hourglass className="h-3 w-3" />, label: "Stale", value: String(stale), color: "text-red-400" }] : []),
    { icon: <Clock className="h-3 w-3" />, label: "Avg age", value: formatAge(avgAge), color: avgAge > 3 * ONE_DAY_MS ? "text-amber-400" : "text-foreground/70" },
    ...(recentlyDone > 0 ? [{ icon: <Zap className="h-3 w-3" />, label: "Done today", value: String(recentlyDone), color: "text-emerald-400" }] : []),
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/20 overflow-x-auto" data-testid="kanban-summary-strip">
        {stats.map((stat) => (
          <Tooltip key={stat.label}>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1 text-[11px] tabular-nums whitespace-nowrap ${stat.color}`}>
                {stat.icon}
                <span className="font-medium">{stat.value}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{stat.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// KanbanCard — draggable task card
// ---------------------------------------------------------------------------

function KanbanCard({
  task,
  assignees,
  onClick,
  isDragOverlay,
  isFocused,
}: {
  task: Task;
  assignees: Assignee[];
  onClick?: () => void;
  isDragOverlay?: boolean;
  isFocused?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: isDragOverlay });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const assignee = assignees.find((a) => a.name === task.assignee);
  const colorClass = ASSIGNEE_COLORS[task.assignee ?? ""] ?? "bg-gray-500/20 text-gray-400";

  const stale = isStale(task);

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      data-task-id={task.id}
      className={`rounded-lg border border-border/30 bg-card p-3 cursor-pointer hover:border-border/60 hover:shadow-md hover:-translate-y-px transition-all duration-150 border-l-4 ${
        PRIORITY_COLORS[task.priority]
      } ${isDragging ? "opacity-30" : ""} ${isDragOverlay ? "shadow-xl ring-2 ring-primary/20 rotate-2" : ""} ${stale ? "ring-1 ring-amber-500/30" : ""} ${isFocused ? "ring-2 ring-primary/40 border-primary/50 shadow-md" : ""}`}
      onClick={onClick}
      {...(isDragOverlay ? {} : attributes)}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        {!isDragOverlay && (
          <button
            className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>

          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {/* Priority badge */}
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                PRIORITY_BADGE_COLORS[task.priority]
              }`}
            >
              {task.priority}
            </span>

            {/* Tags (max 2) */}
            {task.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 font-normal"
              >
                {tag}
              </Badge>
            ))}
            {task.tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">
                +{task.tags.length - 2}
              </span>
            )}

            {/* Source icon */}
            {task.source !== "manual" && SOURCE_ICONS[task.source]}

            {/* Task age badge */}
            <TaskAgeBadge task={task} />

            {/* Relative time */}
            <span className={`text-[10px] flex items-center gap-0.5 ml-auto ${stale ? "text-amber-500" : "text-muted-foreground/50"}`} title={formatDate(task.updatedAt)}>
              {stale && <AlertTriangle className="h-2.5 w-2.5" />}
              {task.status === "done" && task.completedAt ? (
                <>
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                  <span className="text-emerald-500/70">{formatRelativeTime(task.completedAt)}</span>
                </>
              ) : (
                <>
                  <Clock className="h-2.5 w-2.5" />
                  {formatRelativeTime(task.updatedAt)}
                </>
              )}
            </span>
          </div>
        </div>

        {/* Assignee initials */}
        {assignee && (
          <span
            className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${colorClass}`}
            title={assignee.displayName}
          >
            {getInitials(assignee.displayName)}
          </span>
        )}
        {!assignee && task.assignee === null && (
          <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/30">
            <User className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KanbanColumn — droppable column
// ---------------------------------------------------------------------------

function KanbanColumn({
  column,
  tasks,
  assignees,
  onCardClick,
  onQuickAdd,
  quickAddInputRef,
  focusedTaskId,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  assignees: Assignee[];
  onCardClick: (task: Task) => void;
  onQuickAdd?: (title: string) => void;
  quickAddInputRef?: React.RefObject<HTMLInputElement | null>;
  focusedTaskId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [quickAddValue, setQuickAddValue] = useState("");
  const fallbackRef = useRef<HTMLInputElement>(null);
  const inputRef = quickAddInputRef ?? fallbackRef;

  const handleQuickAddSubmit = () => {
    const title = quickAddValue.trim();
    if (!title || !onQuickAdd) return;
    onQuickAdd(title);
    setQuickAddValue("");
    inputRef.current?.focus();
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-border/40 bg-muted/20 p-3 flex flex-col gap-2 min-h-[200px] transition-colors ${
        isOver ? "bg-primary/5 border-primary/30" : ""
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-1">
        <div className={`text-sm font-medium flex items-center gap-1.5 ${column.color}`}>
          {column.icon}
          {column.label}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Priority breakdown dots */}
          {tasks.length > 0 && (
            <div className="flex items-center gap-0.5">
              {PRIORITY_ORDER.map((p) => {
                const count = tasks.filter((t) => t.priority === p).length;
                if (count === 0) return null;
                return (
                  <span
                    key={p}
                    className={`w-1.5 h-1.5 rounded-full ${PRIORITY_BAR_COLORS[p]}`}
                    title={`${p}: ${count}`}
                  />
                );
              })}
            </div>
          )}
          <span className="text-xs text-muted-foreground/60 tabular-nums">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Quick-add for To Do column */}
      {onQuickAdd && (
        <div className="flex gap-1.5 mb-1">
          <Input
            ref={inputRef}
            value={quickAddValue}
            onChange={(e) => setQuickAddValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleQuickAddSubmit();
              }
            }}
            placeholder="Add a task..."
            className="h-7 text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleQuickAddSubmit}
            disabled={!quickAddValue.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Sortable task cards */}
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2 flex-1">
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              assignees={assignees}
              onClick={() => onCardClick(task)}
              isFocused={focusedTaskId === task.id}
            />
          ))}

          {tasks.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/30 py-8 gap-1.5">
              <div className="opacity-40">{column.icon}</div>
              <p className="text-xs">
                {column.id === "todo" ? "Add a task above" :
                 column.id === "done" ? "Completed tasks appear here" :
                 "Drag tasks here"}
              </p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskDetailSheet — edit a task
// ---------------------------------------------------------------------------

function TaskDetailSheet({
  task,
  assignees,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task | null;
  assignees: Assignee[];
  onClose: () => void;
  onSave: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("todo");
  const [editAssignee, setEditAssignee] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");
  const [editTags, setEditTags] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync form when task changes
  const taskId = task?.id ?? null;
  useEffect(() => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditStatus(task.status);
    setEditAssignee(task.assignee ?? "__none__");
    setEditPriority(task.priority);
    setEditTags(task.tags.join(", "));
    setConfirmDelete(false);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await onSave(task.id, {
      title: editTitle.trim() || task.title,
      description: editDescription.trim() || null,
      status: editStatus,
      assignee: editAssignee === "__none__" ? null : editAssignee || null,
      priority: editPriority,
      tags,
    });
    setSaving(false);
    onClose();
  };

  const handleDelete = () => {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(task.id);
    onClose();
  };

  return (
    <Sheet open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Task Details</SheetTitle>
        </SheetHeader>

        {task && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Title
              </label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Status
              </label>
              <div className="grid grid-cols-4 gap-1">
                {COLUMNS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setEditStatus(col.id)}
                    className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      editStatus === col.id
                        ? `${col.color} border-current bg-current/10 font-medium`
                        : "border-border/50 text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {col.icon}
                    <span className="hidden sm:inline">{col.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Description
              </label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                placeholder="Optional description..."
              />
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Assignee
              </label>
              <Select value={editAssignee} onValueChange={setEditAssignee}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.name} value={a.name}>
                      {a.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Priority
              </label>
              <Select value={editPriority} onValueChange={(v) => setEditPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      Low
                    </span>
                  </SelectItem>
                  <SelectItem value="medium">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Medium
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      High
                    </span>
                  </SelectItem>
                  <SelectItem value="urgent">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Urgent
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Tags (comma-separated)
              </label>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="e.g. infra, bug, feature"
              />
            </div>

            {/* Read-only info */}
            <div className="border-t border-border/30 pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Source</span>
                <Badge variant="outline" className="text-[10px]">
                  {task.source}
                </Badge>
              </div>

              {task.cronJobId && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Linked Cron Job</span>
                  <span className="font-mono text-[10px]">{task.cronJobId}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(task.createdAt)}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDate(task.updatedAt)}</span>
              </div>

              {task.completedAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Completed</span>
                  <span>{formatDate(task.completedAt)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving || !editTitle.trim()}
                className="flex-1"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant={confirmDelete ? "destructive" : "outline"}
                onClick={handleDelete}
                className="shrink-0"
              >
                {confirmDelete ? (
                  "Confirm Delete"
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// KanbanBoard — main export
// ---------------------------------------------------------------------------

export function KanbanBoard() {
  const { toast } = useToast();
  const { data: tasksData, mutate: mutateTasks, isLoading: tasksLoading } = useSWR(
    "/api/tasks?archived=false",
    fetcher,
    { refreshInterval: 30000 }
  );
  const { data: assigneesData } = useSWR("/api/assignees", fetcher);

  const tasks: Task[] = tasksData?.tasks ?? [];
  const assignees: Assignee[] = assigneesData?.assignees ?? [];

  // Filters
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<TaskPriority | null>(null);
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Mobile column selector
  const [mobileColumn, setMobileColumn] = useState<TaskStatus>("todo");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // DnD state
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Sheet state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Sensors
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, keyboardSensor);

  // Filter tasks client-side
  const filteredTasks = tasks.filter((t) => {
    if (filterAssignee !== null) {
      if (filterAssignee === "__unassigned__") {
        if (t.assignee !== null) return false;
      } else {
        if (t.assignee !== filterAssignee) return false;
      }
    }
    if (filterPriority !== null && t.priority !== filterPriority) return false;
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(lower);
      const matchDesc = (t.description ?? "").toLowerCase().includes(lower);
      const matchTags = t.tags.some((tag) => tag.toLowerCase().includes(lower));
      if (!matchTitle && !matchDesc && !matchTags) return false;
    }
    return true;
  });

  // Group tasks by column
  const tasksByColumn = COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = filteredTasks
        .filter((t) => t.status === col.id)
        .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
      return acc;
    },
    {} as Record<TaskStatus, Task[]>
  );

  // Quick-add
  const handleQuickAdd = useCallback(
    async (title: string) => {
      // Optimistic: add a temp task
      const tempId = `temp-${Date.now()}`;
      const tempTask: Task = {
        id: tempId,
        title,
        description: null,
        status: "todo",
        assignee: null,
        priority: "medium",
        tags: [],
        source: "manual",
        cronJobId: null,
        position: "z",
        metadata: {},
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
      };

      mutateTasks(
        (current: { tasks: Task[]; total: number } | undefined) => ({
          tasks: [...(current?.tasks ?? []), tempTask],
          total: (current?.total ?? 0) + 1,
        }),
        { revalidate: false }
      );

      try {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        mutateTasks();
      } catch {
        // Revert on error
        mutateTasks();
      }
    },
    [mutateTasks]
  );

  // Drag handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      const task = tasks.find((t) => t.id === id);
      setActiveTask(task ?? null);
    },
    [tasks]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const draggedTaskId = active.id as string;
      const draggedTask = tasks.find((t) => t.id === draggedTaskId);
      if (!draggedTask) return;

      // Determine target column. `over.id` could be a column ID or another task ID.
      let targetStatus: TaskStatus;
      let overTaskId: string | null = null;

      if (COLUMNS.some((c) => c.id === over.id)) {
        // Dropped on a column
        targetStatus = over.id as TaskStatus;
      } else {
        // Dropped on another task — find that task's column
        const overTask = tasks.find((t) => t.id === over.id);
        if (!overTask) return;
        targetStatus = overTask.status;
        overTaskId = overTask.id;
      }

      // Build the target column's sorted tasks (excluding the dragged task)
      const columnTasks = tasks
        .filter((t) => t.status === targetStatus && t.id !== draggedTaskId)
        .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

      let newPosition: string;

      if (overTaskId) {
        // Insert at the position of the over-task
        const overIndex = columnTasks.findIndex((t) => t.id === overTaskId);
        const prevPos = overIndex > 0 ? columnTasks[overIndex - 1].position : null;
        const nextPos = columnTasks[overIndex]?.position ?? null;
        newPosition = generateKeyBetween(prevPos, nextPos);
      } else {
        // Append to end of column
        const lastPos =
          columnTasks.length > 0
            ? columnTasks[columnTasks.length - 1].position
            : null;
        newPosition = generateKeyBetween(lastPos, null);
      }

      // Skip if nothing changed
      if (draggedTask.status === targetStatus && draggedTask.position === newPosition) {
        return;
      }

      // Save previous state for undo context
      const prevStatus = draggedTask.status;

      // Optimistic update
      mutateTasks(
        (current: { tasks: Task[]; total: number } | undefined) => {
          if (!current) return current;
          return {
            ...current,
            tasks: current.tasks.map((t) =>
              t.id === draggedTaskId
                ? { ...t, status: targetStatus, position: newPosition }
                : t
            ),
          };
        },
        { revalidate: false }
      );

      if (prevStatus !== targetStatus) {
        const columnLabel = COLUMNS.find(c => c.id === targetStatus)?.label ?? targetStatus;
        toast(`Moved to ${columnLabel}`, "success");
      }

      try {
        await fetch(`/api/tasks/${draggedTaskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus, position: newPosition }),
        });
        mutateTasks();
      } catch {
        mutateTasks();
        toast("Failed to move task", "error");
      }
    },
    [tasks, mutateTasks, toast]
  );

  // Save handler for detail sheet
  const handleSave = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      // Optimistic
      mutateTasks(
        (current: { tasks: Task[]; total: number } | undefined) => {
          if (!current) return current;
          return {
            ...current,
            tasks: current.tasks.map((t) =>
              t.id === id ? { ...t, ...patch } : t
            ),
          };
        },
        { revalidate: false }
      );

      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mutateTasks();
        toast("Task updated", "success");
      } catch {
        mutateTasks();
        toast("Failed to save task", "error");
      }
    },
    [mutateTasks, toast]
  );

  // Delete handler
  const handleDelete = useCallback(
    async (id: string) => {
      mutateTasks(
        (current: { tasks: Task[]; total: number } | undefined) => {
          if (!current) return current;
          return {
            ...current,
            tasks: current.tasks.filter((t) => t.id !== id),
            total: current.total - 1,
          };
        },
        { revalidate: false }
      );

      try {
        const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mutateTasks();
        toast("Task deleted", "success");
      } catch {
        mutateTasks();
        toast("Failed to delete task", "error");
      }
    },
    [mutateTasks, toast]
  );

  // Keyboard navigation
  const [focusedCardIdx, setFocusedCardIdx] = useState(-1);
  const quickAddRef = useRef<HTMLInputElement>(null);

  // Flat list of all visible tasks for keyboard navigation (column order)
  const allVisibleTasks = useMemo(() => {
    const result: Task[] = [];
    for (const col of COLUMNS) {
      result.push(...(tasksByColumn[col.id] || []));
    }
    return result;
  }, [tasksByColumn]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // 'n' focuses quick-add input
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        quickAddRef.current?.focus();
        return;
      }

      // '/' focuses search
      if (e.key === "/" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // 'j' / 'k' navigate cards
      if (e.key === "j" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setFocusedCardIdx((prev) => {
          const next = prev + 1;
          return next >= allVisibleTasks.length ? 0 : next;
        });
        return;
      }

      if (e.key === "k" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setFocusedCardIdx((prev) => {
          const next = prev - 1;
          return next < 0 ? allVisibleTasks.length - 1 : next;
        });
        return;
      }

      // Enter opens the focused card
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (focusedCardIdx >= 0 && focusedCardIdx < allVisibleTasks.length) {
          e.preventDefault();
          setSelectedTask(allVisibleTasks[focusedCardIdx]);
        }
        return;
      }

      // Escape clears focus or closes sheet
      if (e.key === "Escape") {
        if (selectedTask) return; // let sheet handle it
        if (focusedCardIdx >= 0) {
          e.preventDefault();
          setFocusedCardIdx(-1);
        }
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allVisibleTasks, focusedCardIdx, selectedTask]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedCardIdx < 0 || focusedCardIdx >= allVisibleTasks.length) return;
    const taskId = allVisibleTasks[focusedCardIdx].id;
    const el = document.querySelector(`[data-task-id="${taskId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedCardIdx, allVisibleTasks]);

  // Unique assignees present in tasks (for filter buttons)
  const assigneeNames = [
    ...new Set(tasks.map((t) => t.assignee).filter(Boolean)),
  ] as string[];

  // Priority distribution across all filtered tasks
  const priorityDistribution = useMemo(() => {
    const total = filteredTasks.length;
    if (total === 0) return [];
    return PRIORITY_ORDER.map((p) => {
      const count = filteredTasks.filter((t) => t.priority === p).length;
      return { priority: p, count, pct: (count / total) * 100 };
    }).filter((d) => d.count > 0);
  }, [filteredTasks]);

  // Stale task count
  const staleCount = useMemo(() => filteredTasks.filter(isStale).length, [filteredTasks]);

  // Show inline loading shimmer while initial data is fetching
  if (tasksLoading && tasks.length === 0) {
    return (
      <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2">
          <div className="h-7 w-12 rounded-md bg-muted/60 animate-pulse" />
          <div className="h-7 w-16 rounded-md bg-muted/60 animate-pulse" />
          <div className="h-7 w-16 rounded-md bg-muted/60 animate-pulse" />
          <div className="w-px h-5 bg-border/40 hidden sm:block" />
          <div className="h-7 w-[130px] rounded-md bg-muted/60 animate-pulse" />
        </div>
        <div className="flex-1 px-4 pb-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COLUMNS.map((col) => (
              <div key={col.id} className="rounded-lg border border-border/40 bg-muted/20 p-3 min-h-[200px]">
                <div className="flex items-center gap-1.5 mb-3">
                  <div className="h-4 w-4 rounded bg-muted/60 animate-pulse" />
                  <div className="h-4 w-20 rounded bg-muted/60 animate-pulse" />
                </div>
                {[1, 2].map((i) => (
                  <div key={i} className="rounded-lg border border-border/30 bg-card p-3 mb-2 border-l-4 border-l-muted/40">
                    <div className="h-4 w-3/4 rounded bg-muted/60 animate-pulse mb-2" />
                    <div className="flex gap-2">
                      <div className="h-3 w-12 rounded-full bg-muted/60 animate-pulse" />
                      <div className="h-3 w-10 rounded-full bg-muted/60 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      {/* Summary strip */}
      <SummaryStrip tasks={tasks} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        {/* Search */}
        <div className="relative" data-testid="kanban-search">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search tasks... (/)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-7 pr-7 h-7 w-[160px] text-xs"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border/40 hidden sm:block" />

        {/* Assignee filters */}
        <div className="flex items-center gap-1">
          <Button
            variant={filterAssignee === null ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilterAssignee(null)}
          >
            All
          </Button>
          {assigneeNames.map((name) => {
            const a = assignees.find((x) => x.name === name);
            return (
              <Button
                key={name}
                variant={filterAssignee === name ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setFilterAssignee(filterAssignee === name ? null : name)
                }
              >
                {a?.displayName ?? name}
              </Button>
            );
          })}
          <Button
            variant={filterAssignee === "__unassigned__" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              setFilterAssignee(
                filterAssignee === "__unassigned__" ? null : "__unassigned__"
              )
            }
          >
            Unassigned
          </Button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border/40 hidden sm:block" />

        {/* Priority filter */}
        <Select
          value={filterPriority ?? "__all__"}
          onValueChange={(v) => setFilterPriority(v === "__all__" ? null : (v as TaskPriority))}
        >
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All priorities</SelectItem>
            <SelectItem value="urgent">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Urgent
              </span>
            </SelectItem>
            <SelectItem value="high">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                High
              </span>
            </SelectItem>
            <SelectItem value="medium">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Medium
              </span>
            </SelectItem>
            <SelectItem value="low">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                Low
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Task summary counts — colored dots with numbers */}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground/60 tabular-nums">
          {staleCount > 0 && (
            <span className="flex items-center gap-1 text-amber-500" title={`${staleCount} stale task${staleCount > 1 ? "s" : ""} (>3 days)`}>
              <AlertTriangle className="h-3 w-3" />
              <span>{staleCount}</span>
            </span>
          )}
          {COLUMNS.map((col) => {
            const count = tasksByColumn[col.id].length;
            const dotColor = col.id === "todo" ? "bg-gray-400" :
              col.id === "in_progress" ? "bg-blue-500" :
              col.id === "blocked" ? "bg-amber-500" : "bg-emerald-500";
            return (
              <span key={col.id} className="flex items-center gap-1" title={col.label}>
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                <span>{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Priority distribution bar */}
      {filteredTasks.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/30" data-testid="priority-bar">
            {priorityDistribution.map((d) => (
              <div
                key={d.priority}
                className={`${PRIORITY_BAR_COLORS[d.priority]} transition-all duration-300`}
                style={{ width: `${d.pct}%` }}
                title={`${d.priority}: ${d.count}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mobile column selector */}
      {isMobile && (
        <div className="flex gap-1 px-4 pb-2 sm:hidden">
          {COLUMNS.map((col) => {
            const count = tasksByColumn[col.id].length;
            const isActive = mobileColumn === col.id;
            return (
              <button
                key={col.id}
                onClick={() => setMobileColumn(col.id)}
                className={`flex-1 flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                  isActive
                    ? `${col.color} border-current bg-current/10 font-medium`
                    : "border-border/40 text-muted-foreground/60 hover:bg-muted/30"
                }`}
              >
                {col.icon}
                <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* DnD board */}
      <div className="flex-1 px-4 pb-4 pt-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className={isMobile ? "flex flex-col gap-4" : "grid sm:grid-cols-2 lg:grid-cols-4 gap-4"}>
            {COLUMNS.filter((col) => !isMobile || col.id === mobileColumn).map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasksByColumn[col.id]}
                assignees={assignees}
                onCardClick={setSelectedTask}
                onQuickAdd={col.id === "todo" ? handleQuickAdd : undefined}
                quickAddInputRef={col.id === "todo" ? quickAddRef : undefined}
                focusedTaskId={focusedCardIdx >= 0 && focusedCardIdx < allVisibleTasks.length ? allVisibleTasks[focusedCardIdx].id : null}
              />
            ))}
          </div>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {activeTask && (
              <div className="w-[260px]">
                <KanbanCard
                  task={activeTask}
                  assignees={assignees}
                  isDragOverlay
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Keyboard hints footer */}
      <div className="flex items-center justify-between px-4 pb-2 pt-1 border-t border-border/20 flex-shrink-0">
        <span className="text-[10px] text-muted-foreground/50">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
          {searchText && " (filtered)"}
        </span>
        <span className="text-[10px] text-muted-foreground/30 hidden sm:inline" data-testid="kanban-keyboard-hints">
          <kbd className="font-mono">/</kbd> search · <kbd className="font-mono">n</kbd> new · <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> navigate · <kbd className="font-mono">Enter</kbd> open
        </span>
      </div>

      {/* Task detail sheet */}
      <TaskDetailSheet
        task={selectedTask}
        assignees={assignees}
        onClose={() => setSelectedTask(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </Card>
  );
}
