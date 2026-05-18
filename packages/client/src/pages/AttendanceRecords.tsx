import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  Search,
  Users,
  Download,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Calendar,
  FileText,
} from "lucide-react";
import type { AttendanceEntry, EventRoom, FormDefinition, FormField } from "@application/shared";
import { attendanceApi, roomsApi, formsApi, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

const ITEMS_PER_PAGE = 15;

const formatValue = (value: string | number | boolean | null): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const formatColumnName = (key: string): string => {
  if (!key) return "";
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/[-_]/g, " ");
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export const AttendanceRecords = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [room, setRoom] = useState<EventRoom | null>(null);
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<string>("submittedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchEntries = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch room and attendance data first as they are critical
      const [roomData, attendanceData] = await Promise.all([
        roomsApi.get(id),
        attendanceApi.list(id)
      ]);
      setRoom(roomData);
      setEntries(attendanceData.items);

      // Fetch form definition separately; fallback labels are used if it fails
      try {
        const formData = await formsApi.get(id);
        setForm(formData);
      } catch (err) {
        console.warn("Could not load form definition for labels:", err);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [id]);

  // Derive columns from form definition AND actual data to ensure nothing is missed
  const columns = useMemo(() => {
    const formFields = form?.fields || [];
    
    // Track what we've already accounted for (case-insensitive for labels)
    const fieldIdSet = new Set(formFields.map(f => f.id));
    const fieldLabelsNormalized = new Set(formFields.map(f => f.label.toLowerCase().trim()));
    
    // System fields that might accidentally exist in the data object
    const systemFields = new Set(["id", "roomid", "formdefinitionid", "submittedat", "photourl", "roomtitle", "roomname"]);

    // Collect all unique keys present in the actual attendance data
    const dataKeys = new Set<string>();
    entries.forEach((e) => {
      if (e.data && typeof e.data === "object") {
        Object.keys(e.data).forEach((k) => dataKeys.add(k));
      }
    });

    // 1. Start with current form fields to preserve designed order and labels
    const cols: { id: string; label: string; source: "form" | "data" }[] = formFields.map(f => ({ 
      id: f.id, 
      label: f.label,
      source: "form" as const
    }));

    // 2. Add any keys found in data that aren't in the current form (legacy or system fields)
    const extraKeys = Array.from(dataKeys)
      .filter(k => {
        const kLower = k.toLowerCase().trim();
        // Skip if it's already a field ID
        if (fieldIdSet.has(k)) return false;
        // Skip if it's a system field
        if (systemFields.has(kLower)) return false;
        // Skip if its formatted name or itself matches an existing label (case-insensitive)
        if (fieldLabelsNormalized.has(kLower)) return false;
        const formatted = formatColumnName(k).toLowerCase().trim();
        if (fieldLabelsNormalized.has(formatted)) return false;
        
        return true;
      })
      .sort();
      
    extraKeys.forEach(k => {
      cols.push({ 
        id: k, 
        label: formatColumnName(k),
        source: "data" as const
      });
    });

    // 3. Heuristic: Move 'Name' fields to the front of the dynamic columns if they exist
    cols.sort((a, b) => {
      const nameKeywords = ["name", "full name", "first name", "student name", "attendee name"];
      const aIsName = nameKeywords.includes(a.label.toLowerCase());
      const bIsName = nameKeywords.includes(b.label.toLowerCase());
      if (aIsName && !bIsName) return -1;
      if (!aIsName && bIsName) return 1;
      return 0;
    });

    return cols;
  }, [entries, form]);

  const hasPhotos = useMemo(() => entries.some(e => e.photoUrl), [entries]);

  // Filter entries by search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((entry) =>
      Object.values(entry.data).some(
        (v) => v !== null && String(v).toLowerCase().includes(q),
      ),
    );
  }, [entries, searchQuery]);

  // Sort entries
  const sortedEntries = useMemo(() => {
    const sorted = [...filteredEntries];
    sorted.sort((a, b) => {
      let aVal: string | number | boolean | null | undefined;
      let bVal: string | number | boolean | null | undefined;

      if (sortKey === "submittedAt") {
        aVal = a.submittedAt;
        bVal = b.submittedAt;
      } else if (sortKey === "roomTitle") {
        aVal = room?.title || "";
        bVal = room?.title || "";
      } else {
        // Find by ID or Label (case-insensitive fallback)
        const col = columns.find(c => c.id === sortKey);
        const label = col?.label;
        
        aVal = a.data[sortKey];
        if (aVal === undefined && label) {
          // Try exact label match
          aVal = a.data[label];
          // Try case-insensitive match if still undefined
          if (aVal === undefined) {
            const key = Object.keys(a.data).find(k => k.toLowerCase() === label.toLowerCase());
            if (key) aVal = a.data[key];
          }
        }

        bVal = b.data[sortKey];
        if (bVal === undefined && label) {
          bVal = b.data[label];
          if (bVal === undefined) {
            const key = Object.keys(b.data).find(k => k.toLowerCase() === label.toLowerCase());
            if (key) bVal = b.data[key];
          }
        }
      }

      if ((aVal === null || aVal === undefined) && (bVal === null || bVal === undefined)) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredEntries, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / ITEMS_PER_PAGE));
  const paginatedEntries = sortedEntries.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIndicator = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) return null;
    return <span className="ml-1 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const handleExportCSV = () => {
    if (sortedEntries.length === 0) return;
    const headers = [
      "#", 
      "Room Name",
      "Submitted At",
      ...columns.map(c => c.label),
      ...(hasPhotos ? ["Photo URL"] : [])
    ];
    const csvRows = [
      headers.join(","),
      ...sortedEntries.map((entry, idx) =>
        [
          idx + 1,
          `"${room?.title || "—"}"`,
          `"${format(new Date(entry.submittedAt), "yyyy-MM-dd HH:mm:ss")}"`,
          ...columns.map((col) => {
            const label = col.label;
            let val = entry.data[col.id];
            if (val === undefined && label) {
              val = entry.data[label];
              if (val === undefined) {
                const key = Object.keys(entry.data).find(k => k.toLowerCase() === label.toLowerCase());
                if (key) val = entry.data[key];
              }
            }
            return `"${formatValue(val ?? null)}"`;
          }),
          ...(hasPhotos ? [`"${entry.photoUrl || ""}"`] : [])
        ].join(","),
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room?.title || "Attendance"}-Records-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    if (!id) return;
    setPdfLoading(true);
    setError(null);
    try {
      const blob = await roomsApi.downloadReportPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Official-Event-Report-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download PDF report:", err);
      setError(err instanceof ApiClientError ? err.message : "Failed to generate PDF report. Please ensure Gotenberg is running.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {room ? `${room.title} Records` : "Attendance Records"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Detailed attendance log for {room ? room.title : "this room"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchEntries()}
            disabled={loading || pdfLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={pdfLoading || sortedEntries.length === 0}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          {user?.role === "ngo_admin" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPDF}
              disabled={pdfLoading || sortedEntries.length === 0 || room?.status !== "ended"}
              className="bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 hover:text-primary transition-all backdrop-blur-md shadow-sm gap-1.5"
              title={room?.status !== "ended" ? "PDF Report is only available after the live session has ended" : undefined}
            >
              {pdfLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              {pdfLoading ? "Generating..." : "Download PDF Report"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{entries.length}</p>
              <p className="text-xs text-muted-foreground">Total Entries</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{columns.length}</p>
              <p className="text-xs text-muted-foreground">Form Fields</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {entries.length > 0 && entries[entries.length - 1]
                  ? format(new Date(entries[entries.length - 1]!.submittedAt), "MMM d")
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">First Entry</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {entries.length > 0 && entries[0]
                  ? format(new Date(entries[0].submittedAt), "MMM d")
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Latest Entry</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search entries…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-1.5 tabular-nums whitespace-nowrap">
          {filteredEntries.length !== entries.length && (
            <span>{filteredEntries.length} of </span>
          )}
          <span>{entries.length} records</span>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-center text-destructive text-sm">
            {error}
            <Button variant="ghost" className="ml-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => void fetchEntries()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading attendance records…</p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && entries.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No attendance records yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Entries will appear here once attendees submit the attendance form.
            </p>
            <Link
              to={`/rooms/${id}/attendance`}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Go to attendance form
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      {!loading && !error && paginatedEntries.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wider w-12">
                    #
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap"
                    onClick={() => handleSort("roomTitle")}
                  >
                    Room Name
                    <SortIndicator columnKey="roomTitle" />
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap"
                    onClick={() => handleSort("submittedAt")}
                  >
                    Submitted At
                    <SortIndicator columnKey="submittedAt" />
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap"
                      onClick={() => handleSort(col.id)}
                    >
                      {col.label}
                      <SortIndicator columnKey={col.id} />
                    </th>
                  ))}
                  {hasPhotos && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wider whitespace-nowrap">
                      Photo
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedEntries.map((entry, idx) => {
                  const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground/60 font-mono tabular-nums text-xs">
                        {globalIdx}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-xs">
                        {room?.title || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-xs">
                        <div>{format(new Date(entry.submittedAt), "MMM d, yyyy")}</div>
                        <div className="text-muted-foreground font-normal">
                          {format(new Date(entry.submittedAt), "h:mm:ss a")}
                        </div>
                      </td>
                      {columns.map((col) => {
                        const label = col.label;
                        const id = col.id;
                        
                        // Try matching by ID first, then Label, then case-insensitive variants
                        let val = entry.data[id];
                        if (val === undefined) {
                          val = entry.data[label];
                        }
                        if (val === undefined) {
                          // Case-insensitive search through keys
                          const idLower = id.toLowerCase();
                          const labelLower = label.toLowerCase();
                          const matchingKey = Object.keys(entry.data).find(k => {
                            const kLower = k.toLowerCase();
                            return kLower === idLower || kLower === labelLower;
                          });
                          if (matchingKey) val = entry.data[matchingKey];
                        }
                        
                        return (
                          <td
                            key={`${entry.id}-${col.id}`}
                            className="px-4 py-3 text-xs max-w-[200px] truncate"
                            title={String(val ?? "")}
                          >
                            {formatValue(val ?? null)}
                          </td>
                        );
                      })}
                      {hasPhotos && (
                        <td className="px-4 py-3 text-xs">
                          {entry.photoUrl ? (
                            <a
                              href={entry.photoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block w-8 h-8 rounded border border-border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
                            >
                              <img
                                src={entry.photoUrl}
                                alt="attendance"
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground tabular-nums">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === currentPage ? "primary" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className="h-7 w-7 p-0 text-xs"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
