import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database, Save, Plus, Trash2, UploadCloud, Loader2, CheckCircle2, HardDrive, FolderOpen, Link2Off, Link2, X, Folder, FileText, RefreshCw } from "lucide-react";
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { DriveFilePicker, type DriveFile } from "@/components/DriveFilePicker";

type InputMode = "drive" | "upload" | "local";

export default function SummoningRituals() {
  const { toast } = useToast();

  // ── Google Drive status ─────────────────────────────────────────────────────
  const { data: googleStatus, refetch: refetchGoogleStatus } = trpc.google.status.useQuery();
  const disconnectGoogle = trpc.google.disconnect.useMutation({
    onSuccess: () => { refetchGoogleStatus(); toast({ title: "Google Drive disconnected" }); },
  });

  // ── Game systems from DB ────────────────────────────────────────────────────
  const { data: gameSystemsData } = trpc.gameSystems.list.useQuery();
  const gameSystems = gameSystemsData?.map(g => g.name) ?? ["Dungeons & Dragons 5e"];

  // ── Ingestion form ──────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>("drive");
  const [gameSystem, setGameSystem] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [blockSize, setBlockSize] = useState(10);
  const [lastJobIds, setLastJobIds] = useState<number[]>([]);

  // Upload-mode state
  type UploadMode = "file" | "folder";
  const [uploadMode, setUploadMode] = useState<UploadMode>("file");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [recursive, setRecursive] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_MIMES = /^(application\/pdf|image\/(png|jpe?g|webp|tiff?))$/;

  function pickFiles(raw: FileList | null) {
    if (!raw) return;
    const all = Array.from(raw);
    const filtered = all.filter(f => {
      if (!ACCEPTED_MIMES.test(f.type)) return false;
      // For folder picks: respect recursive toggle by checking path depth
      // webkitRelativePath = "FolderName/sub/file.pdf" → depth 2 means nested
      if (f.webkitRelativePath) {
        const depth = f.webkitRelativePath.split("/").length - 1; // segments after folder root
        if (!recursive && depth > 1) return false;
      }
      return true;
    });
    setUploadFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}|${f.size}`));
      const added = filtered.filter(f => !existing.has(`${f.name}|${f.size}`));
      return [...prev, ...added];
    });
  }

  const effectiveGameSystem = gameSystem || gameSystems[0] || "Dungeons & Dragons 5e";

  const createJob = trpc.jobs.create.useMutation({
    onError(err) {
      toast({ title: "Summoning failed", description: err.message, variant: "destructive" });
    },
  });

  const [uploading, setUploading] = useState(false);

  const handleSubmit = async () => {
    if (inputMode === "drive") {
      if (!driveFiles.length) {
        toast({ title: "No files selected", description: "Pick files from Google Drive.", variant: "destructive" });
        return;
      }
      const ids: number[] = [];
      for (const f of driveFiles) {
        try {
          const data = await createJob.mutateAsync({
            sourceFile: f.name,
            gameSystem: effectiveGameSystem,
            storageProvider: "google_drive",
            driveFileId: f.id,
            blockSize,
          });
          ids.push(data.id);
        } catch {
          // individual error already toasted by onError
        }
      }
      if (ids.length) {
        setLastJobIds(ids);
        setDriveFiles([]);
        toast({ title: "Ritual begun", description: `${ids.length} job(s) started — ${blockSize} pages per block, auto-continuing until complete.` });
      }
    } else if (inputMode === "upload") {
      if (!uploadFiles.length) {
        toast({ title: "No files selected", description: "Choose a PDF or image file to upload.", variant: "destructive" });
        return;
      }
      setUploading(true);
      setUploadProgress({ done: 0, total: uploadFiles.length });
      const ids: number[] = [];
      const failed: string[] = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress({ done: i, total: uploadFiles.length });
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("gameSystem", effectiveGameSystem);
          const res = await fetch("/api/upload/ingest", { method: "POST", body: formData });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error ?? "Upload failed");
          }
          const data = await res.json();
          ids.push(data.jobId);
        } catch (err: any) {
          failed.push(file.name);
        }
      }
      setUploadProgress(null);
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
      if (ids.length > 0) {
        setLastJobIds(ids);
        toast({
          title: "Ritual begun",
          description: failed.length > 0
            ? `${ids.length} job(s) started; ${failed.length} failed: ${failed.slice(0, 3).join(", ")}`
            : ids.length === 1
              ? `Job #${ids[0]} is processing ${blockSize} pages per block.`
              : `${ids.length} jobs started (${ids.map(id => `#${id}`).join(", ")}).`,
        });
      } else {
        toast({ title: "Upload failed", description: `All ${failed.length} file(s) failed.`, variant: "destructive" });
      }
      setUploading(false);
    } else {
      const trimmed = localPath.trim();
      if (!trimmed) {
        toast({ title: "Path required", description: "Provide a local file path.", variant: "destructive" });
        return;
      }
      const data = await createJob.mutateAsync({ sourceFile: trimmed, gameSystem: effectiveGameSystem, storageProvider: "local", blockSize });
      setLastJobIds([data.id]);
      setLocalPath("");
      toast({ title: "Ritual begun", description: `Job #${data.id} is processing ${blockSize} pages per block, auto-continuing until complete.` });
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="game-system">Game System</Label>
                <select
                  id="game-system"
                  value={effectiveGameSystem}
                  onChange={e => setGameSystem(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background/50 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {gameSystems.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-size">Pages per Block</Label>
                <select
                  id="block-size"
                  value={blockSize}
                  onChange={e => setBlockSize(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background/50 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {[1, 2, 5, 10].map(n => <option key={n} value={n}>{n} page{n > 1 ? "s" : ""}</option>)}
                </select>
              </div>
            </div>

            {/* Input-mode-specific controls */}
            {inputMode === "drive" && (
              <div className="space-y-2">
                <Label>Source Files</Label>
                <div className="flex gap-2 items-center">
                  <DriveFilePicker
                    onFilesPicked={files => setDriveFiles(prev => {
                      const existing = new Set(prev.map(f => f.id));
                      const added = files.filter(f => !existing.has(f.id));
                      return [...prev, ...added].sort((a, b) => a.name.localeCompare(b.name));
                    })}
                    disabled={!googleStatus?.connected || isPending}
                  />
                  {driveFiles.length > 0 && (
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setDriveFiles([])}>
                      Clear all
                    </Button>
                  )}
                </div>
                {driveFiles.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto border border-border/40 rounded-md p-2 bg-muted/10">
                    {driveFiles.map(f => (
                      <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground" title={f.name}>{f.name}</span>
                        <button onClick={() => setDriveFiles(prev => prev.filter(x => x.id !== f.id))} className="flex-shrink-0 text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!googleStatus?.connected && (
                  <p className="text-xs text-muted-foreground">Connect Google Drive above to use the file picker.</p>
                )}
              </div>
            )}

            {inputMode === "upload" && (
              <div className="space-y-3">
                {/* File vs Folder toggle */}
                <div className="flex gap-1 p-1 rounded-md bg-muted/30 border border-border/40">
                  {([
                    { key: "file",   label: "File",   icon: FileText },
                    { key: "folder", label: "Folder", icon: Folder },
                  ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => { setUploadMode(key); setUploadFiles([]); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-xs font-medium transition-colors ${
                        uploadMode === key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Hidden inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp,image/tiff"
                  multiple
                  className="hidden"
                  onChange={e => pickFiles(e.target.files)}
                />
                {/* webkitdirectory must be set via attribute, not prop */}
                <input
                  ref={folderInputRef}
                  type="file"
                  {...{ webkitdirectory: "" } as any}
                  className="hidden"
                  onChange={e => pickFiles(e.target.files)}
                />

                {uploadMode === "file" ? (
                  <Button variant="outline" size="sm" className="w-full gap-2"
                    onClick={() => fileInputRef.current?.click()} disabled={isPending}>
                    <FileText className="w-3.5 h-3.5" />
                    Choose File{uploadFiles.length > 0 ? "s" : ""}…
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full gap-2"
                      onClick={() => folderInputRef.current?.click()} disabled={isPending}>
                      <Folder className="w-3.5 h-3.5" />
                      Choose Folder…
                    </Button>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={recursive}
                        onChange={e => setRecursive(e.target.checked)}
                        className="rounded"
                      />
                      Include files in subfolders (recursive)
                    </label>
                  </div>
                )}

                {/* File list */}
                {uploadFiles.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{uploadFiles.length} file{uploadFiles.length !== 1 ? "s" : ""} selected
                        ({(uploadFiles.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)} MB total)
                      </span>
                      <button onClick={() => setUploadFiles([])} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="max-h-32 overflow-y-auto border border-border/40 rounded-md p-2 bg-muted/10 space-y-0.5">
                      {uploadFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-muted-foreground" title={f.webkitRelativePath || f.name}>
                            {f.webkitRelativePath || f.name}
                          </span>
                          <span className="flex-shrink-0 text-muted-foreground/60">
                            {(f.size / 1024 / 1024).toFixed(1)}MB
                          </span>
                          <button onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}
                            className="flex-shrink-0 text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload progress */}
                {uploadProgress && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Uploading {uploadProgress.done + 1} / {uploadProgress.total}…
                  </div>
                )}
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

            {lastJobIds.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {lastJobIds.length === 1
                  ? `Job #${lastJobIds[0]} started — check the Chronicle for progress, then review in Trials of Truth.`
                  : `${lastJobIds.length} jobs started (${lastJobIds.map(id => `#${id}`).join(", ")}) — review in Trials of Truth.`}
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
