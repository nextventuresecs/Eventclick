import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import {
  FIELD_TYPES,
  FormDefinitionSchema,
  type FieldType,
  type FormField,
} from "@application/shared";
import { ApiClientError, formsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

const genId = () => Math.random().toString(36).slice(2, 10);

const newField = (type: FieldType): FormField => ({
  id: genId(),
  label: `New ${type} field`,
  type,
  required: false,
  options: type === "select" ? ["Option 1"] : undefined,
});

interface FieldRowProps {
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
  onRemove: () => void;
}

const FieldRow = ({ field, onChange, onRemove }: FieldRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-3 rounded-md border border-border bg-card p-3"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex items-start pt-2 text-muted-foreground hover:text-foreground cursor-grab"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="flex-1 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
          <Input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Label"
          />
          <select
            value={field.type}
            onChange={(e) => {
              const type = e.target.value as FieldType;
              onChange({
                type,
                options: type === "select" ? field.options ?? ["Option 1"] : undefined,
              });
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {field.type === "select" && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Options (comma-separated)</Label>
            <Input
              value={(field.options ?? []).join(", ")}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="male, female, other"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ required: e.target.checked })}
              className="w-4 h-4"
            />
            Required
          </label>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-sm text-destructive hover:underline"
          >
            <Trash2 className="w-4 h-4" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
};

export const RoomFormBuilder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fields, setFields] = useState<FormField[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    formsApi
      .get(id)
      .then((form) => {
        if (form) {
          setFields(form.fields);
          setVersion(form.version);
        }
      })
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : "Failed to load form"),
      )
      .finally(() => setLoading(false));
  }, [id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((items) => {
      const oldIndex = items.findIndex((f) => f.id === active.id);
      const newIndex = items.findIndex((f) => f.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }, []);

  const addField = (type: FieldType) =>
    setFields((items) => [...items, newField(type)]);

  const patchField = (idx: number, patch: Partial<FormField>) =>
    setFields((items) =>
      items.map((f, i) => (i === idx ? ({ ...f, ...patch } as FormField) : f)),
    );

  const removeField = (idx: number) =>
    setFields((items) => items.filter((_, i) => i !== idx));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!id) return;

    const parsed = FormDefinitionSchema.safeParse({ fields });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid form");
      return;
    }

    setSaving(true);
    try {
      const saved = await formsApi.save(id, parsed.data);
      setVersion(saved.version);
      setSuccess(`Saved as version ${saved.version}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading form…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center w-10 h-10 rounded-md text-foreground hover:bg-muted transition-colors shrink-0 -ml-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Attendance Form</h2>
          <p className="text-muted-foreground text-sm">
            {version ? `Current version: v${version}` : "No form yet — build one below."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/rooms/${id}/attendance`)}
          className="text-sm text-primary hover:underline"
        >
          Preview attendance →
        </button>
      </div>

      <Card>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4 pt-6">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No fields yet. Add one below.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={fields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {fields.map((field, idx) => (
                      <FieldRow
                        key={field.id}
                        field={field}
                        onChange={(patch) => patchField(idx, patch)}
                        onRemove={() => removeField(idx)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground w-full">Add field:</span>
              {FIELD_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addField(t)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {t}
                </Button>
              ))}
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 text-sm border border-emerald-500/20">
                {success}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-3 border-t border-border pt-6 bg-muted/20">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-md px-4 h-10 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={saving || fields.length === 0} className="min-w-[120px]">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Form"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
