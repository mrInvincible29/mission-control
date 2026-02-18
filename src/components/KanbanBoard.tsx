"use client";

import { useState, useCallback, useRef } from "react";
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
} from "lucide-react";
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
    icon: <Loader2 className="h-4 w-4" />,
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

// ---------------------------------------------------------------------------
// KanbanCard — draggable task card
// ---------------------------------------------------------------------------

function KanbanCard({
  task,
  assignees,
  onClick,
  isDragOverlay,
}: {
  task: Task;
  assignees: Assignee[];
  onClick?: () => void;
  isDragOverlay?: boolean;
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

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      className={`rounded-lg border border-border/30 bg-card p-3 cursor-pointer hover:border-border/60 transition-colors border-l-4 ${
        PRIORITY_COLORS[task.priority]
      } ${isDragging ? "opacity-30" : ""} ${isDragOverlay ? "shadow-xl ring-2 ring-primary/20 rotate-2" : ""}`}
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
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  assignees: Assignee[];
  onCardClick: (task: Task) => void;
  onQuickAdd?: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [quickAddValue, setQuickAddValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
        <span className="text-xs text-muted-foreground/60 tabular-nums">
          {tasks.length}
        </span>
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
            />
          ))}

          {tasks.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/40 py-8">
              No tasks
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
  const [editAssignee, setEditAssignee] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");
  const [editTags, setEditTags] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync form when task changes
  const lastTaskId = useRef<string | null>(null);
  if (task && task.id !== lastTaskId.current) {
    lastTaskId.current = task.id;
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditAssignee(task.assignee ?? "");
    setEditPriority(task.priority);
    setEditTags(task.tags.join(", "));
    setConfirmDelete(false);
    setSaving(false);
  }

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onSave(task.id, {
      title: editTitle.trim() || task.title,
      description: editDescription.trim() || null,
      assignee: editAssignee || null,
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

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Description
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Optional description..."
              />
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Assignee
              </label>
              <select
                value={editAssignee}
                onChange={(e) => setEditAssignee(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Priority
              </label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
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
  const { data: tasksData, mutate: mutateTasks } = useSWR(
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

      try {
        await fetch(`/api/tasks/${draggedTaskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus, position: newPosition }),
        });
        mutateTasks();
      } catch {
        mutateTasks();
      }
    },
    [tasks, mutateTasks]
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
        await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        mutateTasks();
      } catch {
        mutateTasks();
      }
    },
    [mutateTasks]
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
        await fetch(`/api/tasks/${id}`, { method: "DELETE" });
        mutateTasks();
      } catch {
        mutateTasks();
      }
    },
    [mutateTasks]
  );

  // Unique assignees present in tasks (for filter buttons)
  const assigneeNames = [
    ...new Set(tasks.map((t) => t.assignee).filter(Boolean)),
  ] as string[];

  return (
    <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2">
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
        <select
          value={filterPriority ?? ""}
          onChange={(e) =>
            setFilterPriority(
              e.target.value ? (e.target.value as TaskPriority) : null
            )
          }
          className="h-7 rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Task count */}
        <span className="ml-auto text-xs text-muted-foreground/60">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* DnD board */}
      <div className="flex-1 px-4 pb-4 pt-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasksByColumn[col.id]}
                assignees={assignees}
                onCardClick={setSelectedTask}
                onQuickAdd={col.id === "todo" ? handleQuickAdd : undefined}
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
