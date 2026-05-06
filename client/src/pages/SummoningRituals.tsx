import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database, Save, Plus, Trash2, UploadCloud, Loader2, CheckCircle2, HardDrive, FolderOpen, Link2Off, Link2 } from "lucide-react";
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { DriveFilePicker } from "@/components/DriveFilePicker";

const GAME_SYSTEMS = [
  "Dungeons & Dragons 5e",
  "Pathfinder 2e",
  "Call of Cthulhu 7e",
  "Custom / Other",
];

type InputMode = "drive" | "upload" | "local";

export default function SummoningRituals() {
  const { toast } = useToast();

  // ── Google Drive status ─────────────────────────────────────────────────────
  const { data: googleStatus, refetch: refetchGoogleStatus } = trpc.google.status.useQuery();
  const disconnectGoogle = trpc.google.disconnect.useMutation({
    onSuccess: () => { refetchGoogleStatus(); toast({ title: "Google Drive disconnected" }); },
  });

  // ── Ingestion form ──────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>("drive");
  const [gameSystem, setGameSystem] = useState(GAME_SYSTEMS[0]);
  const [localPath, setLocalPath] = useState("");
  const [driveFile, setDriveFile] = useState<{ id: string; name: string } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [lastJobId, setLastJobId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createJob = trpc.jobs.create.useMutation({
    onSuccess(data) {
      setLastJobId(data.id);
      setLocalPath("");
      setDriveFile(null);
      setUploadFile(null);
      toast({ title: "Ritual begun", description: `Job #${data.id} is now processing up to 10 pages.` });
    },
    onError(err) {
      toast({ title: "Summoning failed", description: err.message, variant: "destructive" });
    },
  });

  const [uploading, setUploading] = useState(false);

  const handleSubmit = async () => {
    if (inputMode === "drive") {
      if (!driveFile) {
        toast({ title: "No file selected", description: "Pick a file from Google Drive.", variant: "destructive" });
        return;
      }
      createJob.mutate({
        sourceFile: driveFile.name,
        gameSystem,
        storageProvider: "google_drive",
        driveFileId: driveFile.id,
      });
    } else if (inputMode === "upload") {
      if (!uploadFile) {
        toast({ title: "No file selected", description: "Choose a PDF to upload.", variant: "destructive" });
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("gameSystem", gameSystem);
        const res = await fetch("/api/upload/ingest", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error ?? "Upload failed");
        }
        const data = await res.json();
        setLastJobId(data.jobId);
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast({ title: "Ritual begun", description: `Job #${data.jobId} is now processing up to 10 pages.` });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    } else {
      const trimmed = localPath.trim();
      if (!trimmed) {
        toast({ title: "Path required", description: "Provide a local file path.", variant: "destructive" });
        return;
      }
      createJob.mutate({ sourceFile: trimmed, gameSystem, storageProvider: "local" });
    }
  };

  const isPending = createJob.isPending || uploading;

  // ── Lexicon ─────────────────────────────────────────────────────────────────
  const [lexicon, setLexicon] = useState([
    "Armor Class", "Hit Points", "Saving Throw", "Dexterity", "Constitution",
    "Intelligence", "Wisdom", "Charisma", "Initiative", "Proficiency Bonus",
  ]);
  const [newTerm, setNewTerm] = useState("");
  const addTerm = () => {
    const t = newTerm.trim();
    if (t && !lexicon.includes(t)) { setLexicon([...lexicon, t]); setNewTerm(""); }
  };
  const removeTerm = (term: string) => setLexicon(lexicon.filter(t => t !== term));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Database className="w-10 h-10 text-primary" />
          Summoning Rituals
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Summon new knowledge into the Arkanum. Each ritual processes up to 10 pages and queues them for review.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* New Import Job */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-primary" />
              New Summoning Ritual
            </CardTitle>
            <CardDescription>Configure a new ingestion job. Processes up to 10 pages (HITL mode).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Google Drive connection banner */}
            <div className="flex items-center justify-between p-3 rounded-md border border-border/50 bg-muted/20">
              <div className="flex items-center gap-2 text-sm">
                <HardDrive className="w-4 h-4" />
                <span>Google Drive</span>
                {googleStatus?.connected
                  ? <span className="text-green-500 flex items-center gap-1"><Link2 className="w-3 h-3" /> Connected</span>
                  : <span className="text-muted-foreground flex items-center gap-1"><Link2Off className="w-3 h-3" /> Not connected</span>}
              </div>
              {googleStatus?.connected ? (
                <Button variant="ghost" size="sm" onClick={() => disconnectGoogle.mutate()}>Disconnect</Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/auth/google">Connect</a>
                </Button>
              )}
            </div>

            {/* Input mode tabs */}
            <div className="flex gap-1 p-1 rounded-md bg-muted/30 border border-border/40">
              {([
                { key: "drive", label: "Google Drive", icon: HardDrive },
                { key: "upload", label: "Upload", icon: UploadCloud },
                { key: "local", label: "Local Path", icon: FolderOpen },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setInputMode(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                    inputMode === key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="game-system">Game System</Label>
              <select
                id="game-system"
                value={gameSystem}
                onChange={e => setGameSystem(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background/50 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {GAME_SYSTEMS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* Input-mode-specific controls */}
            {inputMode === "drive" && (
              <div className="space-y-2">
                <Label>Source File</Label>
                <div className="flex gap-2 items-center">
                  <DriveFilePicker
                    onFilePicked={f => setDriveFile({ id: f.id, name: f.name })}
                    disabled={!googleStatus?.connected || isPending}
                  />
                  {driveFile && (
                    <span className="text-sm text-muted-foreground truncate max-w-[200px]" title={driveFile.name}>
                      {driveFile.name}
                    </span>
                  )}
                </div>
                {!googleStatus?.connected && (
                  <p className="text-xs text-muted-foreground">Connect Google Drive above to use the file picker.</p>
                )}
              </div>
            )}

            {inputMode === "upload" && (
              <div className="space-y-2">
                <Label htmlFor="file-upload">PDF File</Label>
                <input
                  ref={fileInputRef}
                  id="file-upload"
                  type="file"
                  accept="application/pdf"
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                />
                {uploadFile && <p className="text-xs text-muted-foreground">{uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(1)} MB)</p>}
              </div>
            )}

            {inputMode === "local" && (
              <div className="space-y-2">
                <Label htmlFor="local-path">Container File Path</Label>
                <Input
                  id="local-path"
                  value={localPath}
                  onChange={e => setLocalPath(e.target.value)}
                  placeholder="/app/input/monster-manual.pdf"
                  className="font-mono bg-background/50"
                />
              </div>
            )}

            {lastJobId && (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle2 className="w-4 h-4" />
                Job #{lastJobId} started — check the Chronicle for progress, then review in Trials of Truth.
              </div>
            )}

            <Button className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleSubmit} disabled={isPending}>
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Summoning…</>
                : <><Plus className="w-4 h-4" /> Begin Summoning</>}
            </Button>
          </CardContent>
        </Card>

        {/* Lexicon */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Words of Binding (Lexicon)</CardTitle>
            <CardDescription>Manage the domain-specific vocabulary used to validate OCR extractions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-6">
              <Input
                placeholder="Add new term (e.g., 'Eldritch Blast')"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTerm()}
                className="bg-background/50"
              />
              <Button onClick={addTerm} className="gap-2 whitespace-nowrap">
                <Plus className="w-4 h-4" />
                Add Term
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto p-2 border border-border/50 rounded-md bg-muted/10">
              {lexicon.map((term) => (
                <div key={term} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground border border-border/50 text-sm">
                  {term}
                  <button onClick={() => removeTerm(term)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full gap-2 mt-6">
              <Save className="w-4 h-4" />
              Save Lexicon Changes
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
