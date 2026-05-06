import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, CheckCircle2, AlertCircle, Pause, RotateCcw, Loader2, Gamepad2, Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

function GameSystemAdmin() {
  const { data: systems, refetch } = trpc.gameSystems.listAll.useQuery();
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editAbbr, setEditAbbr] = useState("");

  const createMut = trpc.gameSystems.create.useMutation({
    onSuccess: () => { refetch(); setNewName(""); setNewAbbr(""); toast.success("Game system added."); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.gameSystems.update.useMutation({
    onSuccess: () => { refetch(); setEditId(null); toast.success("Updated."); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.gameSystems.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Removed."); },
    onError: (e) => toast.error(e.message),
  });

  const startEdit = (s: { id: number; name: string; abbreviation: string | null }) => {
    setEditId(s.id); setEditName(s.name); setEditAbbr(s.abbreviation ?? "");
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-primary" /> Game Systems
        </CardTitle>
        <CardDescription>Manage the list of game systems available in Summoning Rituals.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new */}
        <div className="flex gap-2">
          <Input placeholder="Name (e.g. Dungeons & Dragons 5e)" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && newName.trim() && createMut.mutate({ name: newName.trim(), abbreviation: newAbbr.trim() || undefined })}
            className="bg-background/50" />
          <Input placeholder="Abbrev." value={newAbbr} onChange={e => setNewAbbr(e.target.value)} className="bg-background/50 w-28" />
          <Button size="sm" className="gap-1.5 flex-shrink-0" disabled={!newName.trim() || createMut.isPending}
            onClick={() => createMut.mutate({ name: newName.trim(), abbreviation: newAbbr.trim() || undefined })}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>

        {/* List */}
        <div className="space-y-1">
          {systems?.map(s => (
            <div key={s.id} className={`flex items-center gap-2 p-2 rounded-md border ${s.isActive ? "border-border/40 bg-muted/10" : "border-dashed border-border/30 opacity-50"}`}>
              {editId === s.id ? (
                <>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs bg-background/50 flex-1" />
                  <Input value={editAbbr} onChange={e => setEditAbbr(e.target.value)} placeholder="Abbrev." className="h-7 text-xs bg-background/50 w-20" />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateMut.mutate({ id: s.id, name: editName, abbreviation: editAbbr || null })}>
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{s.name}</span>
                  {s.abbreviation && <span className="text-xs text-muted-foreground">{s.abbreviation}</span>}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => updateMut.mutate({ id: s.id, isActive: !s.isActive })}>
                    {s.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => startEdit(s)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm(`Remove "${s.name}"?`)) deleteMut.mutate({ id: s.id }); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Inactive systems are hidden in Summoning Rituals. Click ✕ on a row to deactivate it.</p>
      </CardContent>
    </Card>
  );
}

export default function OverseeScribes() {
  const { data: stats, isLoading: statsLoading } = trpc.jobs.stats.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const { data: jobs, isLoading: jobsLoading, refetch } = trpc.jobs.list.useQuery(
    undefined,
    { refetchInterval: 10000 }
  );

  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);

  const deleteMut = trpc.jobs.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Job removed."); },
    onError: (e) => toast.error(e.message),
  });
  const clearMut = trpc.jobs.clear.useMutation({
    onSuccess: () => { refetch(); toast.success("Jobs cleared."); },
    onError: (e) => toast.error(e.message),
  });

  const statusColors: Record<string, { bg: string; text: string; dot?: boolean }> = {
    queued: { bg: "bg-muted/50", text: "text-muted-foreground" },
    processing: { bg: "bg-blue-500/10", text: "text-blue-500", dot: true },
    pass1_layout: { bg: "bg-yellow-500/10", text: "text-yellow-500", dot: true },
    pass2_extraction: { bg: "bg-blue-500/10", text: "text-blue-500", dot: true },
    binarization: { bg: "bg-yellow-500/10", text: "text-yellow-500", dot: true },
    completed: { bg: "bg-green-500/10", text: "text-green-500" },
    failed: { bg: "bg-red-500/10", text: "text-red-500" },
    review: { bg: "bg-orange-500/10", text: "text-orange-500" },
    hitl_review: { bg: "bg-orange-500/10", text: "text-orange-500", dot: true },
  };

  const getStatusStyle = (status: string) => statusColors[status] || statusColors.queued;
  const hasFailed = (jobs ?? []).some((j: any) => j.status === "failed");
  const hasCompleted = (jobs ?? []).some((j: any) => j.status === "completed");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Activity className="w-10 h-10 text-primary" />
          Oversee the Scribes
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Track the status of active ingestion queues, background processes, and the Human-in-the-Loop (HITL) review queue. Ensure the scribes are working efficiently.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Active Scribes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-3xl font-bold font-mono">{(stats?.active ?? 0) + (stats?.queued ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">{stats?.active ?? 0} processing, {stats?.queued ?? 0} queued</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-3xl font-bold font-mono text-green-500">{stats?.completed ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Total completed jobs</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" /> Scribe Queries (HITL)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-3xl font-bold font-mono text-orange-500">{(stats?.total ?? 0) - (stats?.completed ?? 0) - (stats?.failed ?? 0) - (stats?.active ?? 0) - (stats?.queued ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Requires manual review</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Transcription Queue</CardTitle>
            <CardDescription>Current status of PDF processing batches.</CardDescription>
          </div>
          <div className="flex gap-2">
            {hasFailed && (
              <Button variant="outline" size="sm" className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
                onClick={() => clearMut.mutate({ statuses: ["failed"] })} disabled={clearMut.isPending}>
                <Trash2 className="w-4 h-4" /> Clear Failed
              </Button>
            )}
            {hasCompleted && (
              <Button variant="outline" size="sm" className="gap-2 text-muted-foreground"
                onClick={() => clearMut.mutate({ statuses: ["completed"] })} disabled={clearMut.isPending}>
                <Trash2 className="w-4 h-4" /> Clear Completed
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
              <RotateCcw className="w-4 h-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No active jobs</p>
              <p className="text-sm">The scribes are idle. Start a new ingestion from Summoning Rituals.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-md">Job ID</th>
                    <th className="px-4 py-3">Source File</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3 rounded-tr-md"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {jobs.map((job: any) => {
                    const style = getStatusStyle(job.status);
                    const progress = job.totalPages > 0 ? Math.round((job.processedPages / job.totalPages) * 100) : 0;
                    const progressColor = job.status === "completed" ? "bg-green-500" : job.status === "failed" ? "bg-red-500" : "bg-blue-500";
                    const isExpanded = expandedJobId === job.id;
                    return (
                      <>
                        <tr key={job.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-mono">JOB-{job.id}</td>
                          <td className="px-4 py-3 font-medium max-w-[200px] truncate" title={job.sourceFile}>{job.sourceFile}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-full bg-muted rounded-full h-2 max-w-[100px]">
                                <div className={`${progressColor} h-2 rounded-full`} style={{ width: `${progress}%` }}></div>
                              </div>
                              <span className="text-xs font-mono">{progress}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text} border border-current/20`}>
                                {style.dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>}
                                {job.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                              </span>
                              {job.errorMessage && (
                                <button onClick={() => setExpandedJobId(isExpanded ? null : job.id)} className="text-red-400 hover:text-red-300">
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => deleteMut.mutate({ id: job.id })} disabled={deleteMut.isPending}
                              className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && job.errorMessage && (
                          <tr key={`${job.id}-err`} className="bg-red-500/5">
                            <td colSpan={6} className="px-4 py-2">
                              <p className="text-xs font-mono text-red-400 whitespace-pre-wrap break-all">{job.errorMessage}</p>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <GameSystemAdmin />
    </div>
  );
}
