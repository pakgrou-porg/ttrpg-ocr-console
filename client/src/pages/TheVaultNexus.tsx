import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Database, Plus, Trash2, TestTube, Loader2, CheckCircle2, XCircle,
  Shield, Plug, ChevronDown, ChevronUp, Clock, Info, RefreshCw, Pencil,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed")  return <XCircle className="h-4 w-4 text-red-500" />;
  return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/50" />;
}

function statusLabel(status: string) {
  if (status === "success") return "Verified";
  if (status === "failed")  return "Failed";
  return "Untested";
}

function bootstrapBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    pending:     { label: "Pending Setup",  className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    in_progress: { label: "Bootstrapping",  className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    completed:   { label: "Ready",          className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    failed:      { label: "Bootstrap Failed", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const entry = map[status] ?? { label: status, className: "" };
  return <Badge className={`text-xs ${entry.className}`}>{entry.label}</Badge>;
}

function roleBadge(role: string) {
  if (role === "primary") return <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 text-xs">Primary</Badge>;
  return <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/30 text-xs">Secondary</Badge>;
}

function syncModeLabel(mode: string) {
  const map: Record<string, string> = {
    primary_only: "Primary Only",
    mirror:       "Mirror (Both)",
    failover:     "Failover",
  };
  return map[mode] ?? mode;
}

// ─── Component ───────────────────────────────────────────────────────────────

const defaultForm = {
  name: "",
  connectionType: "supabase_local" as string,
  host: "localhost",
  port: 5432,
  databaseName: "postgres",
  password: "",
  serviceKey: "",
  anonKey: "",
  supabaseUrl: "",
  role: "primary" as string,
  syncMode: "primary_only" as string,
  useSsl: false,
  notes: "",
};

export default function TheVaultNexus() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [editForm, setEditForm] = useState(defaultForm);

  const { data: instances, isLoading, refetch } = trpc.connections.list.useQuery();
  const { data: typesData } = trpc.connections.types.useQuery();
  const connectionTypes = typesData?.connectionTypes;
  const roles = [{ id: "primary", label: "Primary" }, { id: "secondary", label: "Secondary" }];
  const syncModes = [
    { id: "primary_only", label: "Primary Only" },
    { id: "mirror",       label: "Mirror (Both)" },
    { id: "failover",     label: "Failover" },
  ];

  const createMutation = trpc.connections.create.useMutation({
    onSuccess: () => { toast.success("Supabase instance registered."); refetch(); setIsCreateOpen(false); setForm(defaultForm); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.connections.delete.useMutation({
    onSuccess: () => { toast.success("Instance removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.connections.update.useMutation({
    onSuccess: () => { toast.success("Instance updated."); refetch(); setIsEditOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const testMutation = trpc.connections.test.useMutation({
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message ?? `Connection verified (${result.latencyMs}ms).`);
      else toast.error(`Connection failed: ${result.error}`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const activateMutation = trpc.connections.setActive.useMutation({
    onSuccess: () => { toast.success("Active pipeline target updated."); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const bootstrapMutation = trpc.connections.setBootstrapStatus.useMutation({
    onSuccess: () => { toast.success("Bootstrap status updated."); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: form.name,
      connectionType: form.connectionType as any,
      host: form.host,
      port: form.port,
      databaseName: form.databaseName,
      password: form.password || undefined,
      serviceKey: form.serviceKey || undefined,
      anonKey: form.anonKey || undefined,
      supabaseUrl: form.supabaseUrl || undefined,
      role: form.role as any,
      syncMode: form.syncMode as any,
      useSsl: form.useSsl,
      notes: form.notes || undefined,
    });
  };

  const f = (field: keyof typeof defaultForm, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const ef = (field: keyof typeof defaultForm, value: any) =>
    setEditForm(prev => ({ ...prev, [field]: value }));

  const openEdit = (inst: any) => {
    setEditingId(inst.id);
    setEditForm({
      name: inst.name,
      connectionType: inst.connectionType,
      host: inst.host,
      port: inst.port,
      databaseName: inst.databaseName,
      password: "",
      serviceKey: "",
      anonKey: inst.anonKey ?? "",
      supabaseUrl: inst.supabaseUrl ?? "",
      role: inst.role,
      syncMode: inst.syncMode,
      useSsl: inst.useSsl,
      notes: inst.notes ?? "",
    });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      name: editForm.name,
      host: editForm.host,
      port: editForm.port,
      databaseName: editForm.databaseName,
      password: editForm.password || undefined,
      serviceKey: editForm.serviceKey || undefined,
      anonKey: editForm.anonKey || undefined,
      supabaseUrl: editForm.supabaseUrl || undefined,
      role: editForm.role as any,
      syncMode: editForm.syncMode as any,
      useSsl: editForm.useSsl,
      notes: editForm.notes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
            <Database className="h-8 w-8 text-cyan-400" />
            The Vault Nexus
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Register and manage Supabase instances for the OCR pipeline. Supports primary/secondary roles,
            mirroring, and failover. Credentials are encrypted at rest with AES-256-GCM.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm(defaultForm)} className="flex-shrink-0">
              <Plus className="h-4 w-4 mr-2" /> Register Instance
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Register Supabase Instance</DialogTitle>
              <DialogDescription>
                Add a local or cloud Supabase database. Passwords and service keys are encrypted before storage.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* Name */}
              <div className="space-y-2">
                <Label>Instance Name</Label>
                <Input
                  placeholder="e.g., Local Docker — Primary"
                  value={form.name}
                  onChange={e => f("name", e.target.value)}
                />
              </div>

              {/* Type + Role */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.connectionType} onValueChange={v => {
                    f("connectionType", v);
                    f("useSsl", v === "supabase_cloud");
                    if (v === "supabase_cloud") f("host", "db.<project-ref>.supabase.co");
                    else f("host", "localhost");
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {typesData?.connectionTypes.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={v => f("role", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roles.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sync Mode */}
              <div className="space-y-2">
                <Label>Sync Mode</Label>
                <Select value={form.syncMode} onValueChange={v => f("syncMode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {syncModes.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.syncMode === "primary_only" && "Writes go to this instance only."}
                  {form.syncMode === "mirror" && "Writes replicated to all mirror instances simultaneously."}
                  {form.syncMode === "failover" && "Secondary promoted only when primary is unreachable."}
                </p>
              </div>

              {/* Host + Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>Host</Label>
                  <Input
                    placeholder="localhost"
                    value={form.host}
                    onChange={e => f("host", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={form.port}
                    onChange={e => f("port", Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Database name */}
              <div className="space-y-2">
                <Label>Database Name</Label>
                <Input
                  placeholder="postgres"
                  value={form.databaseName}
                  onChange={e => f("databaseName", e.target.value)}
                />
              </div>

              {/* Password + Service Key */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>DB Password <span className="text-muted-foreground text-xs">(encrypted)</span></Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => f("password", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Service Role Key <span className="text-muted-foreground text-xs">(encrypted)</span></Label>
                  <Input
                    type="password"
                    placeholder="eyJ…"
                    value={form.serviceKey}
                    onChange={e => f("serviceKey", e.target.value)}
                  />
                </div>
              </div>

              {/* Anon Key + Supabase URL */}
              <div className="space-y-2">
                <Label>Anon Key <span className="text-muted-foreground text-xs">(public)</span></Label>
                <Input
                  placeholder="eyJ…"
                  value={form.anonKey}
                  onChange={e => f("anonKey", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Supabase REST URL <span className="text-muted-foreground text-xs">(Kong gateway)</span></Label>
                <Input
                  placeholder={form.connectionType === "supabase_cloud" ? "https://<ref>.supabase.co" : "http://localhost:8100"}
                  value={form.supabaseUrl}
                  onChange={e => f("supabaseUrl", e.target.value)}
                />
              </div>

              {/* SSL */}
              <div className="flex items-center gap-3">
                <Switch
                  id="ssl-toggle"
                  checked={form.useSsl}
                  onCheckedChange={v => f("useSsl", v)}
                />
                <Label htmlFor="ssl-toggle">Require SSL / TLS</Label>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea
                  placeholder="Optional notes…"
                  value={form.notes}
                  onChange={e => f("notes", e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={!form.name || !form.host || !form.databaseName || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Instance List ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      ) : instances?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Database className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <h3 className="text-base font-semibold">No instances registered</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Register Instance" to add your first Supabase database.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {instances?.map(inst => {
            const isExpanded = expandedId === inst.id;
            const i = inst as any;
            return (
              <Card
                key={inst.id}
                className={`transition-all ${inst.isActive ? "ring-2 ring-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.08)]" : ""}`}
              >
                {/* ── Primary row ── */}
                <CardHeader className="pb-0 pt-4 px-5">
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: status dot + name + badges */}
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${inst.isActive ? "bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.7)]" : "bg-muted-foreground/30"}`} />
                      <CardTitle className="text-base truncate">{inst.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {inst.connectionType === "supabase_local" ? "Local" : "Cloud"}
                      </Badge>
                      {roleBadge(inst.role)}
                      {inst.isActive && (
                        <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 text-xs flex-shrink-0">Active</Badge>
                      )}
                      {bootstrapBadge(inst.bootstrapStatus)}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline" size="sm" className="h-8 gap-1.5"
                        onClick={() => testMutation.mutate({ id: inst.id })}
                        disabled={testMutation.isPending}
                      >
                        {testMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <TestTube className="h-3.5 w-3.5" />}
                        Test
                      </Button>
                      {!inst.isActive && (
                        <Button
                          variant="outline" size="sm" className="h-8 gap-1.5"
                          onClick={() => activateMutation.mutate({ id: inst.id })}
                          disabled={activateMutation.isPending}
                        >
                          <Plug className="h-3.5 w-3.5" />
                          Activate
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(inst)}
                        title="Edit instance"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          const msg = inst.isActive
                            ? "This is the active instance. Removing it will leave no active pipeline target. Continue?"
                            : "Remove this Supabase instance?";
                          if (confirm(msg)) deleteMutation.mutate({ id: inst.id });
                        }}
                        title="Remove instance"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground"
                        onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Connection string */}
                  <p className="font-mono text-xs text-muted-foreground mt-2 ml-5 pb-3">
                    {inst.host}:{inst.port}/{inst.databaseName}
                    {inst.supabaseUrl && <span className="ml-2 opacity-60">· {inst.supabaseUrl}</span>}
                  </p>
                </CardHeader>

                {/* ── Expanded detail row ── */}
                {isExpanded && (
                  <>
                    <Separator />
                    <CardContent className="pt-3 pb-4 px-5">
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                        {/* Test status */}
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={inst.lastTestStatus} />
                          <span>{statusLabel(inst.lastTestStatus)}</span>
                          {inst.lastTestedAt && (
                            <span className="flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3" />
                              {new Date(inst.lastTestedAt).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {/* SSL */}
                        <div className="flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5" />
                          <span>{inst.useSsl ? "SSL enabled" : "SSL disabled"}</span>
                        </div>

                        {/* Sync mode */}
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>{syncModeLabel(inst.syncMode)}</span>
                        </div>

                        {/* Credentials stored */}
                        <div className="flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5" />
                          <span>
                            {i.hasPassword ? "DB password stored" : "No DB password"}
                            {" · "}
                            {i.hasServiceKey
                              ? `Service key stored (${inst.serviceKeyPrefix}••••${inst.serviceKeySuffix})`
                              : "No service key"}
                          </span>
                        </div>

                        {/* Anon key */}
                        {inst.anonKey && (
                          <div className="flex items-center gap-1.5">
                            <Info className="h-3.5 w-3.5" />
                            <span>Anon key present</span>
                          </div>
                        )}

                        {/* Bootstrap status controls */}
                        {inst.bootstrapStatus !== "completed" && (
                          <div className="w-full flex items-center gap-2 mt-1">
                            <span className="text-xs">Mark bootstrap:</span>
                            <Button
                              variant="outline" size="sm" className="h-6 text-xs px-2"
                              onClick={() => bootstrapMutation.mutate({ id: inst.id, status: "completed" })}
                              disabled={bootstrapMutation.isPending}
                            >
                              Completed
                            </Button>
                            <Button
                              variant="outline" size="sm" className="h-6 text-xs px-2"
                              onClick={() => bootstrapMutation.mutate({ id: inst.id, status: "in_progress" })}
                              disabled={bootstrapMutation.isPending}
                            >
                              In Progress
                            </Button>
                          </div>
                        )}

                        {/* Notes */}
                        {inst.notes && (
                          <div className="w-full text-xs italic text-muted-foreground/70 mt-0.5">
                            {inst.notes}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Supabase Instance</DialogTitle>
            <DialogDescription>
              Leave password / service key blank to keep the existing stored value.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>Instance Name</Label>
              <Input value={editForm.name} onChange={e => ef("name", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={editForm.connectionType} onValueChange={v => ef("connectionType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {typesData?.connectionTypes.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editForm.role} onValueChange={v => ef("role", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sync Mode</Label>
              <Select value={editForm.syncMode} onValueChange={v => ef("syncMode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {syncModes.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Host</Label>
                <Input value={editForm.host} onChange={e => ef("host", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input type="number" value={editForm.port} onChange={e => ef("port", Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Database Name</Label>
              <Input value={editForm.databaseName} onChange={e => ef("databaseName", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>DB Password <span className="text-muted-foreground text-xs">(blank = keep existing)</span></Label>
                <Input type="password" placeholder="••••••••" value={editForm.password} onChange={e => ef("password", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Service Role Key <span className="text-muted-foreground text-xs">(blank = keep existing)</span></Label>
                <Input type="password" placeholder="eyJ…" value={editForm.serviceKey} onChange={e => ef("serviceKey", e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Anon Key</Label>
              <Input placeholder="eyJ…" value={editForm.anonKey} onChange={e => ef("anonKey", e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Supabase REST URL</Label>
              <Input placeholder="http://localhost:8100" value={editForm.supabaseUrl} onChange={e => ef("supabaseUrl", e.target.value)} />
            </div>

            <div className="flex items-center gap-3">
              <Switch id="edit-ssl-toggle" checked={editForm.useSsl} onCheckedChange={v => ef("useSsl", v)} />
              <Label htmlFor="edit-ssl-toggle">Require SSL / TLS</Label>
            </div>

            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea placeholder="Optional notes…" value={editForm.notes} onChange={e => ef("notes", e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleUpdate}
              disabled={!editForm.name || !editForm.host || !editForm.databaseName || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
