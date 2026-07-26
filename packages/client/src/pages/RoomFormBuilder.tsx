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
import {
  ArrowLeft,
  Calendar,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  CheckSquare,
  ListFilter,
  Type,
  Hash,
  Mail,
  Phone,
  Sparkles,
  FileCheck,
  Eye,
  Sliders,
} from "lucide-react";
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
import { Card, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card";

const genId = () => Math.random().toString(36).slice(2, 10);

const FIELD_ICONS: Record<FieldType, React.ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  email: Mail,
  phone: Phone,
  select: ListFilter,
  checkbox: CheckSquare,
  date: Calendar,
};

const newField = (type: FieldType): FormField => ({
  id: genId(),
  label: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Field`,
  type,
  required: false,
  options: type === "select" ? ["Option 1", "Option 2"] : undefined,
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

  const Icon = FIELD_ICONS[field.type] || Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border bg-white p-5 shadow-xs transition-all ${
        isDragging ? "border-purple-400 ring-2 ring-purple-200" : "border-gray-200/90 hover:border-purple-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex items-center justify-center p-2 rounded-xl text-gray-400 hover:text-purple-700 hover:bg-purple-50 cursor-grab shrink-0 transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        <div className="flex-1 space-y-4">
          {/* Header Row */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Field Label</Label>
              <Input
                value={field.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="e.g. Participant Name, Gender, Consent"
                className="input-premium font-semibold text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Field Type</Label>
              <div className="relative">
                <select
                  value={field.type}
                  onChange={(e) => {
                    const type = e.target.value as FieldType;
                    onChange({
                      type,
                      options: type === "select" ? field.options ?? ["Option 1", "Option 2"] : undefined,
                    });
                  }}
                  className="flex h-10 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-purple-500 capitalize"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Dynamic Helper Banners */}
          {field.type === "select" && (
            <div className="rounded-xl bg-purple-50/70 border border-purple-100 p-3.5 text-xs text-purple-900 space-y-1.5">
              <p className="font-bold text-purple-950 flex items-center gap-1.5">
                <ListFilter className="w-4 h-4 text-purple-600" /> Dropdown (Select Menu) Options
              </p>
              <p className="text-purple-800">
                Attendees will select one option from a dropdown menu. Separate your choices with commas below:
              </p>
            </div>
          )}

          {field.type === "checkbox" && (
            <div className="rounded-xl bg-purple-50/70 border border-purple-100 p-3.5 text-xs text-purple-900 space-y-1.5">
              <p className="font-bold text-purple-950 flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-purple-600" /> Checkbox (Binary Switch)
              </p>
              <p className="text-purple-800">
                Attendees will toggle a Yes/No checkbox. Use <strong>Help Text</strong> below to state what checking means (e.g. "I agree to rules").
              </p>
            </div>
          )}

          {field.type === "date" && (
            <div className="rounded-xl bg-purple-50/70 border border-purple-100 p-3.5 text-xs text-purple-900 space-y-1.5">
              <p className="font-bold text-purple-950 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-purple-600" /> Date Picker Field
              </p>
              <p className="text-purple-800">
                Volunteers select a date using a native calendar picker. Data is formatted as <code className="bg-white px-1.5 py-0.5 rounded border border-purple-200 font-mono text-[11px]">YYYY-MM-DD</code>.
              </p>
            </div>
          )}

          {/* Options input for select */}
          {field.type === "select" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Choices (Comma-Separated)</Label>
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
                placeholder="e.g. Male, Female, Prefer not to say"
                className="input-premium font-medium text-xs"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {(field.options ?? []).map((opt, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                    {opt}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Customization Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {["text", "number", "email", "phone"].includes(field.type) ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Placeholder Hint</Label>
                <Input
                  value={field.placeholder ?? ""}
                  onChange={(e) => onChange({ placeholder: e.target.value || undefined })}
                  placeholder={`e.g. Enter ${field.label.toLowerCase()}…`}
                  className="h-9 text-xs input-premium"
                />
              </div>
            ) : (
              <div className="hidden md:block" />
            )}

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">Help / Instructions</Label>
              <Input
                value={field.helpText ?? ""}
                onChange={(e) => onChange({ helpText: e.target.value || undefined })}
                placeholder={
                  field.type === "checkbox"
                    ? "e.g. Participant agreed to organization terms"
                    : "e.g. Provide helpful context or instructions"
                }
                className="h-9 text-xs input-premium"
              />
            </div>
          </div>

          {/* Controls Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
              />
              Required Field
            </label>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Field
            </button>
          </div>
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
        } else {
          setFields([]);
          setVersion(null);
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
      setError(parsed.error.issues[0]?.message ?? "Invalid form configuration");
      return;
    }

    setSaving(true);
    try {
      const saved = await formsApi.save(id, parsed.data);
      setVersion(saved.version);
      setSuccess(`Form schema saved successfully as version ${saved.version}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 space-y-3">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
        <p className="text-sm font-semibold">Loading Form Builder...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
      {/* Header Tile */}
      <div className="rounded-3xl bg-brand-gradient-tile p-6 md:p-8 text-white shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 text-white hover:bg-white/25 backdrop-blur-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15 backdrop-blur-md text-white border border-white/20 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-purple-300" />
              Attendance Form Builder {version ? `(v${version})` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/rooms/${id}/attendance`)}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-white text-purple-950 font-bold text-xs shadow-md hover:bg-purple-50 transition-all cursor-pointer"
          >
            <Eye className="w-4 h-4 text-purple-700" /> Preview Form →
          </button>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold font-display text-white tracking-tight">
          Custom Form Designer
        </h1>
        <p className="text-xs text-white/80 max-w-xl leading-relaxed">
          Drag-and-drop fields, set validation rules, and configure dropdown selects or consent checkboxes for field attendance collection.
        </p>
      </div>

      {/* Main Builder Form */}
      <Card className="card-static rounded-3xl border-gray-200">
        <form onSubmit={onSubmit}>
          <CardContent className="p-6 md:p-8 space-y-6">
            {fields.length === 0 ? (
              <div className="p-10 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 space-y-3">
                <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <CardTitle className="text-base font-bold font-display text-gray-900">No fields in this form yet</CardTitle>
                <CardDescription className="text-xs max-w-sm mx-auto">
                  Click any of the field type buttons below to add custom text, numbers, dropdown selects, or checkboxes.
                </CardDescription>
              </div>
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
                  <div className="space-y-4">
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

            {/* Add Field Toolbar */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <Label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-purple-600" /> Add Field Type
              </Label>
              <div className="flex flex-wrap gap-2">
                {FIELD_TYPES.map((t) => {
                  const Icon = FIELD_ICONS[t] || Type;
                  return (
                    <Button
                      key={t}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addField(t)}
                      className="h-9 px-3 text-xs font-semibold rounded-xl border-gray-200 hover:border-purple-300 hover:bg-purple-50 text-gray-800 gap-1.5 transition-all"
                    >
                      <Icon className="w-3.5 h-3.5 text-purple-600" />
                      <span className="capitalize">{t}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200 font-medium">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 font-semibold flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                {success}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-3 border-t border-gray-100 p-6 bg-gray-50/50 rounded-b-3xl">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-xl px-4 h-10 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </Link>
            <Button
              type="submit"
              disabled={saving || fields.length === 0}
              className="bg-brand-gradient h-10 px-6 rounded-xl font-bold text-xs text-white shadow-xs hover:shadow-md transition-all min-w-32"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving Schema…
                </>
              ) : (
                "Save Form Schema"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
