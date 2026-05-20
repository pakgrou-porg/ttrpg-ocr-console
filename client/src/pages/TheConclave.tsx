import { useState } from "react";
import { Shield, Users, Plus, Trash2, Check, X, ChevronDown, ChevronUp, Mail, Crown, AlertTriangle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";

const FEATURE_AREA_LABELS: Record<string, string> = {
  enter_arkanum: "Enter the Arkanum",
  listen_ramblings: "Listen to Ramblings",
  tome_knowledge: "Tome of Knowledge",
  divination_omens: "Divination & Omens",
  oversee_scribes: "Oversee the Scribes",
  arcane_mechanisms: "Arcane Mechanisms",
  summoning_rituals: "Summoning Rituals",
  incantations_runes: "Incantations & Runes",
};

export default function TheConclave() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState<"user" | "admin">("user");

  // Redirect non-admins
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery();
  const { data: featureAreas } = trpc.admin.featureAreas.useQuery();
  const { data: invitations } = trpc.admin.listInvitations.useQuery();

  const setRole = trpc.admin.setRole.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success("Role updated in the Arkanum."); },
    onError: (e) => toast.error(e.message),
  });

  const setPermission = trpc.admin.setPermission.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success("Permission inscribed."); },
    onError: (e) => toast.error(e.message),
  });

  const removePermission = trpc.admin.removePermission.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success("Permission removed."); },
    onError: (e) => toast.error(e.message),
  });

  const createInvitation = trpc.admin.createInvitation.useMutation({
    onSuccess: (data) => {
      utils.admin.listInvitations.invalidate();
      toast.success(`Invitation scroll dispatched. Token: ${data.token.slice(0, 8)}…`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteDisplayName("");
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeInvitation = trpc.admin.revokeInvitation.useMutation({
    onSuccess: () => { utils.admin.listInvitations.invalidate(); toast.success("Invitation revoked."); },
    onError: (e) => toast.error(e.message),
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { utils.admin.listUsers.invalidate(); toast.success("Scholar removed from the Kodex."); },
    onError: (e) => toast.error(e.message),
  });

  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false);
  const wipeMutation = trpc.admin.wipeProcessingData.useMutation({
    onSuccess: (data) => {
      const total = Object.values(data.deletedCounts).reduce((s, n) => s + n, 0);
      toast.success(`Processing data wiped — ${total} records removed.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const getPermission = (permissions: { featureArea: string; granted: boolean; restrictedGame?: string | null; restrictedVersion?: string | null }[], area: string) =>
    permissions.find((p) => p.featureArea === area);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="w-8 h-8 text-amber-500" />
            The Conclave
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            As Arch-Magister, you govern who may enter the Kodex and which chambers they may access. Grant access, restrict by game or version, and dispatch invitation scrolls to new scholars.
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Dispatch Scroll
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                Dispatch an Invitation Scroll
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Email Address</label>
                <Input
                  placeholder="scholar@realm.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Display Name (optional)</label>
                <Input
                  placeholder="Archmage Evos"
                  value={inviteDisplayName}
                  onChange={(e) => setInviteDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Role</label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "user" | "admin")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Scholar (User)</SelectItem>
                    <SelectItem value="admin">Arch-Magister (Admin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={!inviteEmail || createInvitation.isPending}
                onClick={() =>
                  createInvitation.mutate({
                    email: inviteEmail,
                    displayName: inviteDisplayName || undefined,
                    role: inviteRole,
                    expiresInDays: 7,
                  })
                }
              >
                {createInvitation.isPending ? "Inscribing scroll…" : "Dispatch Invitation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Registered Scholars ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Registered Scholars
        </h2>

        {isLoading ? (
          <div className="text-muted-foreground text-sm animate-pulse">Consulting the registry…</div>
        ) : (
          <div className="space-y-2">
            {(users ?? []).map((u) => {
              const isExpanded = expandedUser === u.id;
              const isOwner = u.openId === user?.openId;
              return (
                <div
                  key={u.id}
                  className="rounded-xl border border-border/50 bg-card/40 overflow-hidden"
                >
                  {/* Row */}
                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {(u.name ?? "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{u.name ?? "Unknown Scholar"}</span>
                        {isOwner && <Crown className="w-3.5 h-3.5 text-amber-500" aria-label="You" />}
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[10px] h-4">
                          {u.role === "admin" ? "Arch-Magister" : "Scholar"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}</p>
                    </div>

                    {/* Role toggle + delete */}
                    {!isOwner && (
                      <>
                        <Select
                          value={u.role}
                          onValueChange={(v) => setRole.mutate({ userId: u.id, role: v as "user" | "admin" })}
                        >
                          <SelectTrigger className="w-36 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Scholar</SelectItem>
                            <SelectItem value="admin">Arch-Magister</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${u.name ?? u.email ?? "this scholar"} from the Kodex? This cannot be undone.`))
                              deleteUser.mutate({ userId: u.id });
                          }}
                          disabled={deleteUser.isPending}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remove scholar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {/* Expand permissions */}
                    <button
                      onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                      className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Permissions panel */}
                  {isExpanded && (
                    <div className="border-t border-border/40 px-4 py-4 bg-background/30">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Chamber Access
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(featureAreas ?? []).map((area) => {
                          const perm = getPermission(u.permissions ?? [], area.id);
                          const isGranted = perm ? perm.granted : true; // default: all granted

                          return (
                            <div
                              key={area.id}
                              className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-card/30"
                            >
                              <Switch
                                checked={isGranted}
                                onCheckedChange={(checked) =>
                                  setPermission.mutate({
                                    userId: u.id,
                                    featureArea: area.id as any,
                                    granted: checked,
                                  })
                                }
                                className="mt-0.5 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-tight">
                                  {FEATURE_AREA_LABELS[area.id] ?? area.label}
                                </p>
                                {isGranted && (
                                  <div className="flex gap-2 mt-1.5">
                                    <Input
                                      placeholder="Restrict game…"
                                      className="h-6 text-xs px-2"
                                      defaultValue={perm?.restrictedGame ?? ""}
                                      onBlur={(e) => {
                                        if (e.target.value !== (perm?.restrictedGame ?? "")) {
                                          setPermission.mutate({
                                            userId: u.id,
                                            featureArea: area.id as any,
                                            granted: true,
                                            restrictedGame: e.target.value || undefined,
                                            restrictedVersion: perm?.restrictedVersion ?? undefined,
                                          });
                                        }
                                      }}
                                    />
                                    <Input
                                      placeholder="Version…"
                                      className="h-6 text-xs px-2 w-24"
                                      defaultValue={perm?.restrictedVersion ?? ""}
                                      onBlur={(e) => {
                                        if (e.target.value !== (perm?.restrictedVersion ?? "")) {
                                          setPermission.mutate({
                                            userId: u.id,
                                            featureArea: area.id as any,
                                            granted: true,
                                            restrictedGame: perm?.restrictedGame ?? undefined,
                                            restrictedVersion: e.target.value || undefined,
                                          });
                                        }
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                              {perm && (
                                <button
                                  onClick={() => removePermission.mutate({ userId: u.id, featureArea: area.id as any })}
                                  className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                                  title="Reset to default"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Pending Invitations ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Invitation Scrolls
        </h2>
        {(invitations ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No scrolls have been dispatched.</p>
        ) : (
          <div className="space-y-2">
            {(invitations ?? []).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-4 px-4 py-3 rounded-xl border border-border/50 bg-card/40"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.accepted ? (
                      <span className="text-emerald-500 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Accepted
                      </span>
                    ) : (
                      `Expires ${new Date(inv.expiresAt).toLocaleDateString()}`
                    )}
                  </p>
                </div>
                <Badge variant={inv.role === "admin" ? "default" : "secondary"} className="text-[10px]">
                  {inv.role === "admin" ? "Arch-Magister" : "Scholar"}
                </Badge>
                {!inv.accepted && (
                  <button
                    onClick={() => revokeInvitation.mutate({ invitationId: inv.id })}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Revoke invitation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          Danger Zone
        </h2>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 flex items-center justify-between gap-6">
          <div>
            <p className="font-medium text-sm">Wipe All Processing Data</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Deletes all ingestion jobs, documents, pages, OCR results, HITL items, content summaries,
              and LLM timing metrics. Preserves users, providers, stage inscriptions, game systems, and
              system config.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="flex-shrink-0 gap-2"
            onClick={() => setWipeConfirmOpen(true)}
            disabled={wipeMutation.isPending}
          >
            {wipeMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />}
            Wipe Data
          </Button>
        </div>
      </section>

      {/* Wipe confirmation dialog */}
      <AlertDialog open={wipeConfirmOpen} onOpenChange={setWipeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Wipe All Processing Data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">This will permanently delete:</span>
              <ul className="list-disc list-inside text-sm space-y-0.5 ml-2">
                <li>All ingestion jobs and their status</li>
                <li>All documents, pages, and OCR results</li>
                <li>All HITL review queue items</li>
                <li>All content summaries and structural breaks</li>
                <li>All LLM timing metrics and processing attempts</li>
              </ul>
              <span className="block pt-1 font-medium text-foreground">
                Users, providers, inscriptions, and config are untouched.
                This cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => wipeMutation.mutate()}
            >
              Yes, wipe everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
