import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, CheckCircle2, AlertCircle, Pause, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function OverseeScribes() {
  const { data: stats, isLoading: statsLoading } = trpc.jobs.stats.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const { data: jobs, isLoading: jobsLoading, refetch } = trpc.jobs.list.useQuery(
    undefined,
    { refetchInterval: 10000 }
  );

  const statusColors: Record<string, { bg: string; text: string; dot?: boolean }> = {
    queued: { bg: "bg-muted/50", text: "text-muted-foreground" },
    processing: { bg: "bg-blue-500/10", text: "text-blue-500", dot: true },
    pass1_layout: { bg: "bg-yellow-500/10", text: "text-yellow-500", dot: true },
    pass2_extraction: { bg: "bg-blue-500/10", text: "text-blue-500", dot: true },
    binarization: { bg: "bg-yellow-500/10", text: "text-yellow-500", dot: true },
    completed: { bg: "bg-green-500/10", text: "text-green-500" },
    failed: { bg: "bg-red-500/10", text: "text-red-500" },
    hitl_review: { bg: "bg-orange-500/10", text: "text-orange-500", dot: true },
  };

  const getStatusStyle = (status: string) => statusColors[status] || statusColors.queued;

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
            <CardTitle className="text-2xl">Active Transcription Queue</CardTitle>
            <CardDescription>Current status of PDF processing batches.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Pause className="w-4 h-4" /> Pause All
            </Button>
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
                    <th className="px-4 py-3 rounded-tr-md">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {jobs.map((job: any) => {
                    const style = getStatusStyle(job.status);
                    const progress = job.totalPages > 0 ? Math.round((job.processedPages / job.totalPages) * 100) : 0;
                    const progressColor = job.status === "completed" ? "bg-green-500" : job.status === "failed" ? "bg-red-500" : "bg-blue-500";
                    return (
                      <tr key={job.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono">JOB-{job.id}</td>
                        <td className="px-4 py-3 font-medium">{job.sourceFile}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-muted rounded-full h-2 max-w-[100px]">
                              <div className={`${progressColor} h-2 rounded-full`} style={{ width: `${progress}%` }}></div>
                            </div>
                            <span className="text-xs font-mono">{progress}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text} border border-current/20`}>
                            {style.dot && <span className={`w-1.5 h-1.5 rounded-full bg-current animate-pulse`}></span>}
                            {job.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
