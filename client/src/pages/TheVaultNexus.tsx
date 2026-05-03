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
  Shield, Plug, ChevronDown, ChevronUp, Clock, Info,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function typeLabel(t: string) {
  const MAP: Record<string, string> = {
    supabase_cloud: "Supabase Cloud",
    supabase_local: "Supabase Local",
    postgres_docker: "Postgres (Docker)",
    postgres_remote: "Postgres (Remote)",
    mysql: "MySQL",
    custom: "Custom",
  };
  return MAP[t] ?? t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function TheVaultNexus() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: connections, isLoading, refetch } = trpc.connections.list.useQuery();
  const { data: connectionTypes } = trpc.connections.types.useQuery();

  const createMutation = trpc.connections.create.useMutation({
    onSuccess: () => { toast.success("Vault connection established."); refetch(); setIsCreateOpen(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.connections.delete.useMutation({
    onSuccess: () => { toast.success("Connection severed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const testMutation = trpc.connections.test.useMutation({
    onSuccess: (result) => {
      if (result.ok) toast.success(`Connection verified (${result.latencyMs}ms).`);
      else toast.error(`Connection failed: ${result.error}`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const activateMutation = trpc.connections.setActive.useMutation({
    onSuccess: () => { toast.success("Vault nexus switched."); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    name: "",
    connectionType: "supabase_local" as string,
    host: "",
    port: 5432,
    databaseName: "postgres",
    username: "",
    password: "",
    useSsl: false,
    notes: "",
  });

  const resetForm = () => setForm({
    name: "", connectionType: "supabase_local", host: "", port: 5432,
    databaseName: "postgres", username: "", password: "", useSsl: false, notes: "",
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: form.name,
      connectionType: form.connectionType as any,
      host: form.host,
      port: form.port,
      databaseName: form.databaseName,
      username: form.username || undefined,
      password: form.password || undefined,
      useSsl: form.useSsl,
      notes: form.notes || undefined,
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
            Register and manage database connections for the OCR pipeline. The active connection
            is used by all pipeline scripts. Credentials are encrypted at rest with AES-256-GCM.
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="flex-shrink-0">
              <Plus className="h-4 w-4 mr-2" /> New Connection
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Register Vault Connection</DialogTitle>
              <DialogDescription>
                Add a new database endpoint. Credentials are encrypted before storage.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <Label>Connection Name</Label>
                <Input
                  placeholder="e.g., Local Docker Supabase"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Connection Type</Label>
                <Select value={form.connectionType} onValueChange={v => setForm(f => ({ ...f, connectionType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {connectionTypes?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>Host</Label>
                  <Input
                    placeholder="localhost"
                    value={form.host}
                    onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={form.port}
                    onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Database Name</Label>
                <Input
                  placeholder="postgres"
                  value={form.databaseName}
                  onChange={e => setForm(f => ({ ...f, databaseName: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Username <span className="text-muted-foreground text-xs font-normal">(encrypted)</span></Label>
                  <Input
                    placeholder="postgres"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password <span className="text-muted-foreground text-xs font-normal">(encrypted)</span></Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="ssl-toggle"
                  checked={form.useSsl}
                  onCheckedChange={v => setForm(f => ({ ...f, useSsl: v }))}
                />
                <Label htmlFor="ssl-toggle">Require SSL / TLS</Label>
              </div>

              <div className="space-y-2">
                <Label>Notes <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Textarea
                  placeholder="Optional notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
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

      {/* ── Connection List ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      ) : connections?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Database className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <h3 className="text-base font-semibold">No connections registered</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Click "New Connection" to register your first database endpoint.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections?.map(conn => {
            const isExpanded = expandedId === conn.id;
            return (
              <Card
                key={conn.id}
                className={`transition-all ${conn.isActive ? "ring-2 ring-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.08)]" : ""}`}
              >
                {/* ── Primary row ── */}
                <CardHeader className="pb-0 pt-4 px-5">
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: status dot + name + type */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${conn.isActive ? "bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.7)]" : "bg-muted-foreground/30"}`} />
                      <CardTitle className="text-base truncate">{conn.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">{typeLabel(conn.connectionType)}</Badge>
                      {conn.isActive && (
                        <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 text-xs flex-shrink-0">Active</Badge>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => testMutation.mutate({ id: conn.id })}
                        disabled={testMutation.isPending}
                      >
                        {testMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <TestTube className="h-3.5 w-3.5" />}
                        Test
                      </Button>
                      {!conn.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => activateMutation.mutate({ id: conn.id })}
                          disabled={activateMutation.isPending}
                        >
                          <Plug className="h-3.5 w-3.5" />
                          Activate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm("Sever this vault connection?")) deleteMutation.mutate({ id: conn.id }); }}
                        disabled={conn.isActive}
                        title={conn.isActive ? "Cannot delete the active connection" : "Delete connection"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground"
                        onClick={() => setExpandedId(isExpanded ? null : conn.id)}
                        title={isExpanded ? "Collapse details" : "Show details"}
                      >
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Connection string — always visible */}
                  <p className="font-mono text-xs text-muted-foreground mt-2 ml-5 pb-3">
                    {conn.host}:{conn.port}/{conn.databaseName}
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
                          <StatusDot status={conn.lastTestStatus} />
                          <span>{statusLabel(conn.lastTestStatus)}</span>
                          {conn.lastTestedAt && (
                            <span className="flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3" />
                              {new Date(conn.lastTestedAt).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {/* SSL */}
                        <div className="flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5" />
                          <span>{conn.useSsl ? "SSL enabled" : "SSL disabled"}</span>
                        </div>

                        {/* Credentials */}
                        <div className="flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5" />
                          <span>{(conn as any).hasCredentials ? "Credentials stored (encrypted)" : "No credentials stored"}</span>
                        </div>

                        {/* Notes */}
                        {conn.notes && (
                          <div className="w-full text-xs italic text-muted-foreground/70 mt-0.5">
                            {conn.notes}
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
    </div>
  );
}
