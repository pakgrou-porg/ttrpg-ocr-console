import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Database, Plus, Trash2, TestTube, Loader2, CheckCircle2, XCircle, Shield, Plug
} from "lucide-react";

export default function TheVaultNexus() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: connections, isLoading, refetch } = trpc.connections.list.useQuery();
  const { data: connectionTypes } = trpc.connections.types.useQuery();

  const createMutation = trpc.connections.create.useMutation({
    onSuccess: () => { toast.success("Vault connection established."); refetch(); setIsCreateOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.connections.delete.useMutation({
    onSuccess: () => { toast.success("Connection severed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const testMutation = trpc.connections.test.useMutation({
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`Connection verified (${result.latencyMs}ms).`);
        refetch();
      } else {
        toast.error(`Connection failed: ${result.error}`);
        refetch();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const activateMutation = trpc.connections.setActive.useMutation({
    onSuccess: () => { toast.success("Vault nexus switched."); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    name: "",
    connectionType: "supabase_cloud" as string,
    host: "",
    port: 5432,
    databaseName: "",
    username: "",
    password: "",
    useSsl: true,
    notes: "",
  });

  const resetForm = () => setForm({
    name: "", connectionType: "supabase_cloud", host: "", port: 5432,
    databaseName: "", username: "", password: "", useSsl: true, notes: "",
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "success": return "Verified";
      case "failed": return "Failed";
      default: return "Untested";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-serif flex items-center gap-3">
            <Database className="h-8 w-8 text-cyan-400" />
            The Vault Nexus
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure and manage database connections. Switch between cloud-hosted Supabase and local Docker instances.
            Credentials are encrypted at rest.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" /> Open New Vault
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Open New Vault Connection</DialogTitle>
              <DialogDescription>Register a new database endpoint for the OCR pipeline data store.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Connection Name</Label>
                <Input placeholder="e.g., Local Docker Supabase" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
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
                  <Input placeholder="localhost or db.supabase.co" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Database Name</Label>
                <Input placeholder="postgres" value={form.databaseName} onChange={e => setForm(f => ({ ...f, databaseName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Username <span className="text-muted-foreground text-xs">(encrypted)</span></Label>
                  <Input placeholder="postgres" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Password <span className="text-muted-foreground text-xs">(encrypted)</span></Label>
                  <Input type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.useSsl} onCheckedChange={v => setForm(f => ({ ...f, useSsl: v }))} />
                <Label>Require SSL</Label>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Optional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!form.name || !form.host || !form.databaseName || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Open Vault
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Connection List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      ) : connections?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No Vault Connections</h3>
            <p className="text-muted-foreground mt-1">Click "Open New Vault" to register your first database connection.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {connections?.map(conn => (
            <Card key={conn.id} className={`transition-all ${conn.isActive ? "ring-2 ring-cyan-500/50" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {conn.isActive ? (
                      <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-gray-500" />
                    )}
                    <CardTitle className="text-lg">{conn.name}</CardTitle>
                    <Badge variant="secondary">{conn.connectionType?.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</Badge>
                    {conn.isActive && <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">Active</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testMutation.mutate({ id: conn.id })}
                      disabled={testMutation.isPending}
                    >
                      {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                      <span className="ml-1">Test</span>
                    </Button>
                    {!conn.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => activateMutation.mutate({ id: conn.id })}
                        disabled={activateMutation.isPending}
                      >
                        <Plug className="h-4 w-4 mr-1" /> Activate
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { if (confirm("Sever this vault connection?")) deleteMutation.mutate({ id: conn.id }); }}
                      disabled={conn.isActive}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="ml-6 font-mono text-xs">
                  {conn.host}:{conn.port}/{conn.databaseName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {getStatusIcon(conn.lastTestStatus)}
                    <span>{getStatusLabel(conn.lastTestStatus)}</span>
                    {conn.lastTestedAt && (
                      <span className="text-xs">({new Date(conn.lastTestedAt).toLocaleDateString()})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" />
                    <span>{conn.useSsl ? "SSL Enabled" : "SSL Disabled"}</span>
                  </div>
                  {conn.notes && (
                    <div className="text-xs italic truncate max-w-[300px]">{conn.notes}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info Card */}
      <Card className="border-cyan-500/30 bg-cyan-500/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-cyan-400 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Security Notice</h4>
              <p className="text-sm text-muted-foreground mt-1">
                All credentials (usernames and passwords) are encrypted with AES-256-GCM before storage.
                The active connection is used by the OCR pipeline scripts for data persistence.
                Switching the active vault will require restarting any running pipeline jobs.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
