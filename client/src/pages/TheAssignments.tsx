import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  GitBranch, Plus, Trash2, Loader2, ArrowUpDown, Layers
} from "lucide-react";

export default function TheAssignments() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: assignments, isLoading, refetch } = trpc.assignments.list.useQuery();
  const { data: stages } = trpc.assignments.stages.useQuery();
  const { data: providers } = trpc.providers.list.useQuery();

  const createMutation = trpc.assignments.create.useMutation({
    onSuccess: () => { toast.success("Assignment inscribed."); refetch(); setIsCreateOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.assignments.update.useMutation({
    onSuccess: () => { toast.success("Assignment updated."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.assignments.delete.useMutation({
    onSuccess: () => { toast.success("Assignment removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    providerId: 0, modelName: "", pipelineStage: "ocr_extraction" as string, priority: 1,
  });

  const resetForm = () => setForm({ providerId: 0, modelName: "", pipelineStage: "ocr_extraction", priority: 1 });

  const handleCreate = () => {
    createMutation.mutate({
      providerId: form.providerId,
      modelName: form.modelName,
      pipelineStage: form.pipelineStage as any,
      priority: form.priority,
    });
  };

  // Group assignments by pipeline stage
  const groupedByStage = assignments?.reduce((acc, a) => {
    const stage = a.pipelineStage;
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(a);
    return acc;
  }, {} as Record<string, typeof assignments>) ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
            <GitBranch className="h-8 w-8 text-amber-400" />
            The Assignments
          </h1>
          <p className="text-muted-foreground mt-1">
            Map specific models to pipeline stages. Each stage can have multiple models with priority ordering for fallback chains.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" /> Inscribe Assignment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Inscribe New Assignment</DialogTitle>
              <DialogDescription>Assign a model from a registered provider to a specific pipeline stage.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Pipeline Stage</Label>
                <Select value={form.pipelineStage} onValueChange={v => setForm(f => ({ ...f, pipelineStage: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={form.providerId ? String(form.providerId) : ""} onValueChange={v => setForm(f => ({ ...f, providerId: Number(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Select a provider..." /></SelectTrigger>
                  <SelectContent>
                    {providers?.filter(p => p.isActive).map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model Name</Label>
                <Input placeholder="e.g., gpt-4o, llava-v1.6, gemini-2.5-pro" value={form.modelName} onChange={e => setForm(f => ({ ...f, modelName: e.target.value }))} />
                {form.providerId > 0 && providers?.find(p => p.id === form.providerId)?.availableModels && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(providers.find(p => p.id === form.providerId)?.availableModels as string[] ?? []).slice(0, 6).map((m: string) => (
                      <Badge
                        key={m}
                        variant="outline"
                        className="text-xs cursor-pointer hover:bg-accent"
                        onClick={() => setForm(f => ({ ...f, modelName: m }))}
                      >
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Priority <span className="text-muted-foreground text-xs">(1 = primary, higher = fallback)</span></Label>
                <Input type="number" min={1} max={10} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!form.modelName || !form.providerId || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Inscribe
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Assignment Matrix grouped by stage */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      ) : Object.keys(groupedByStage).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No Assignments Inscribed</h3>
            <p className="text-muted-foreground mt-1">Click "Inscribe Assignment" to map your first model to a pipeline stage.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Show all stages, even empty ones */}
          {stages?.map(stage => {
            const stageAssignments = groupedByStage[stage.id] ?? [];
            return (
              <Card key={stage.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-amber-400" />
                      <CardTitle className="text-base">{stage.label}</CardTitle>
                      <Badge variant={stageAssignments.length > 0 ? "default" : "secondary"}>
                        {stageAssignments.length} model{stageAssignments.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                {stageAssignments.length > 0 && (
                  <CardContent>
                    <div className="space-y-2">
                      {stageAssignments
                        .sort((a, b) => a.priority - b.priority)
                        .map((assignment, idx) => (
                          <div key={assignment.id} className={`flex items-center justify-between p-3 rounded-lg border ${assignment.isActive ? "bg-card" : "bg-muted opacity-60"}`}>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                                {assignment.priority}
                              </div>
                              <div>
                                <span className="font-mono text-sm font-medium">{assignment.modelName}</span>
                                <span className="text-muted-foreground text-xs ml-2">via {assignment.providerName}</span>
                              </div>
                              {idx === 0 && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Primary</Badge>}
                              {idx > 0 && <Badge variant="outline" className="text-xs">Fallback #{idx}</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateMutation.mutate({ id: assignment.id, isActive: !assignment.isActive })}
                              >
                                {assignment.isActive ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => { if (confirm("Remove this assignment?")) deleteMutation.mutate({ id: assignment.id }); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
