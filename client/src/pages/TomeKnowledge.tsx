import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpCircle, Book, FileText, Code, Terminal, Shield, Database, Zap, CheckCircle } from "lucide-react";

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-muted/40 border border-border/50 rounded-md p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-background border border-border/50 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

const INGEST_EXAMPLE = `curl -X POST https://your-console.manus.space/api/trpc/pipeline.ingestPage \\
  -H "Content-Type: application/json" \\
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \\
  -d '{
    "json": {
      "documentId": 42,
      "pageNumber": 1,
      "imageUrl": "https://s3.example.com/pages/doc42-p001.png",
      "thumbnailUrl": "https://s3.example.com/thumbs/doc42-p001-thumb.png",
      "phash": "a1b2c3d4e5f6a7b8",
      "isBinarized": true,
      "imageWidth": 2480,
      "imageHeight": 3508
    }
  }'

# Response: { "result": { "data": { "json": {
#   "success": true,
#   "pageId": 123,
#   "isDuplicate": false
# } } } }
# If isDuplicate is true, duplicateOfPageId is also returned — skip OCR for this page.`;

const OCR_SUBMIT_EXAMPLE = `curl -X POST https://your-console.manus.space/api/trpc/pipeline.submitOcrResult \\
  -H "Content-Type: application/json" \\
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \\
  -d '{
    "json": {
      "pageId": 123,
      "rawText": "The dragon breathes fire...",
      "structuredData": {
        "type": "monster_stat_block",
        "name": "Ancient Red Dragon",
        "cr": 24
      },
      "layoutMetadata": {
        "elements": [{ "type": "heading", "bbox": [0, 0, 100, 20] }]
      },
      "confidence": 87,
      "pass1Model": "llava-1.6",
      "pass2Model": "anthropic/claude-3.5-sonnet",
      "auditLog": [
        { "timestamp": "2026-05-02T12:00:00Z", "action": "pass1_complete", "model": "llava-1.6" },
        { "timestamp": "2026-05-02T12:00:05Z", "action": "pass2_complete", "model": "claude-3.5-sonnet" }
      ]
    }
  }'

# Response: { "result": { "data": { "json": {
#   "success": true,
#   "ocrResultId": 456,
#   "autoFlagged": false
# } } } }
# If confidence < 70, autoFlagged is true and the page enters the HITL queue automatically.`;

const FLAG_EXAMPLE = `curl -X POST https://your-console.manus.space/api/trpc/pipeline.flagPage \\
  -H "Content-Type: application/json" \\
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \\
  -d '{
    "json": {
      "pageId": 123,
      "reason": "Consensus disagreement between Pass 1 and Pass 2 models",
      "priority": "high",
      "flagCategory": "consensus_failure"
    }
  }'`;

const UPLOAD_EXAMPLE = `curl -X POST https://your-console.manus.space/api/upload/document \\
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \\
  -F "pdf=@/path/to/sourcebook.pdf" \\
  -F "name=Player's Handbook 5e" \\
  -F "gameSystem=D&D 5e" \\
  -F "publisher=Wizards of the Coast" \\
  -F "edition=5th Edition"

# Response: { "success": true, "documentId": 42, "pdfUrl": "https://s3.example.com/..." }`;

const PYTHON_EXAMPLE = `import subprocess, json, os

CONSOLE_URL = os.environ["SCHEDULED_TASK_ENDPOINT_BASE"]
COOKIE = os.environ["SCHEDULED_TASK_COOKIE"]

def post_trpc(procedure: str, data: dict) -> dict:
    result = subprocess.run([
        "curl", "-s", "-X", "POST",
        f"{CONSOLE_URL}/api/trpc/{procedure}",
        "-H", "Content-Type: application/json",
        "-H", f"Cookie: app_session_id={COOKIE}",
        "-d", json.dumps({"json": data})
    ], capture_output=True, text=True)
    return json.loads(result.stdout)["result"]["data"]["json"]

# Register a page
page = post_trpc("pipeline.ingestPage", {
    "documentId": 42,
    "pageNumber": 1,
    "imageUrl": "https://s3.example.com/pages/doc42-p001.png",
    "phash": "a1b2c3d4e5f6a7b8",
    "isBinarized": True,
})

if not page["isDuplicate"]:
    # Submit OCR result
    result = post_trpc("pipeline.submitOcrResult", {
        "pageId": page["pageId"],
        "rawText": extracted_text,
        "structuredData": structured_json,
        "confidence": confidence_score,
        "pass1Model": "llava-1.6",
        "pass2Model": "anthropic/claude-3.5-sonnet",
    })`;

export default function TomeKnowledge() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <HelpCircle className="w-10 h-10 text-primary" />
          Tome of Knowledge
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Documentation, guides, and pipeline integration reference for the TTRPG OCR Console.
        </p>
      </div>

      <Tabs defaultValue="quickstart">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="quickstart" className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Quick Start
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" /> Pipeline API
          </TabsTrigger>
          <TabsTrigger value="schema" className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> Data Schema
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Security
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-1.5">
            <Book className="w-3.5 h-3.5" /> Search Guide
          </TabsTrigger>
        </TabsList>

        {/* ── Quick Start ── */}
        <TabsContent value="quickstart" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Initiation Rites
                </CardTitle>
                <CardDescription>Get up and running in 5 minutes.</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
                  <li>Go to <strong className="text-foreground">The Artificers</strong> and add your LLM provider (OpenRouter, Venice.ai, or local LM Studio). Use the <em>Test Connection</em> button to verify, then <em>Discover Models</em> to cache available models.</li>
                  <li>Navigate to <strong className="text-foreground">Arcane Mechanisms</strong> to assign models to each pipeline stage (layout analysis, content extraction, validation).</li>
                  <li>Go to <strong className="text-foreground">Incantations &amp; Runes</strong> to review and customise the system prompts for each stage.</li>
                  <li>Use <strong className="text-foreground">Summoning Rituals</strong> to create an ingestion job, or upload a PDF directly from the <strong className="text-foreground">Library Shelves</strong> tab in Enter the Arkanum.</li>
                  <li>Monitor progress in <strong className="text-foreground">Oversee the Scribes</strong>. Low-confidence pages are automatically routed to the <strong className="text-foreground">Archivist's Desk</strong> for review.</li>
                  <li>Once complete, explore the extracted records in <strong className="text-foreground">Listen to Ramblings</strong> or browse raw images alongside OCR data in <strong className="text-foreground">Enter the Arkanum → Library Shelves</strong>.</li>
                </ol>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-primary" />
                  Console Pages Reference
                </CardTitle>
                <CardDescription>What each page does at a glance.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {[
                    ["Grand Hall", "System health — DB, agents, cloud conduit"],
                    ["Enter the Arkanum", "Browse lore + Library Shelves (image/OCR viewer)"],
                    ["Listen to Ramblings", "LLM-powered lore generation and search"],
                    ["Tome of Knowledge", "This documentation page"],
                    ["Oversee the Scribes", "Ingestion job monitoring"],
                    ["Divination & Omens", "Telemetry, cost tracking, usage stats"],
                    ["Arcane Mechanisms", "System config — providers, models, DB connections"],
                    ["The Artificers", "LLM provider management + model discovery"],
                    ["Summoning Rituals", "Create and trigger ingestion jobs"],
                    ["Incantations & Runes", "System prompt management"],
                    ["Archivist's Desk", "HITL review queue for flagged pages"],
                    ["The Conclave", "Admin — users, roles, invitations"],
                  ].map(([name, desc]) => (
                    <div key={name} className="flex gap-2">
                      <span className="font-medium text-foreground min-w-[180px]">{name}</span>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Pipeline API ── */}
        <TabsContent value="pipeline" className="space-y-6 mt-6">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-primary" />
                Pipeline Integration Overview
              </CardTitle>
              <CardDescription>
                The Python OCR pipeline communicates with the console via tRPC HTTP endpoints.
                All calls require a valid session cookie.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">tRPC over HTTP</Badge>
                <Badge variant="outline">Session cookie auth</Badge>
                <Badge variant="outline">JSON request/response</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                In scheduled task contexts, use the auto-injected <code className="bg-muted px-1 rounded text-xs">$SCHEDULED_TASK_COOKIE</code> and{" "}
                <code className="bg-muted px-1 rounded text-xs">$SCHEDULED_TASK_ENDPOINT_BASE</code> environment variables.
                All pipeline procedures accept a <code className="bg-muted px-1 rounded text-xs">{`{"json": {...}}`}</code> wrapper in the request body.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-amber-500" />
                1. Register a Page
                <Badge className="ml-auto bg-amber-500/20 text-amber-400 border-amber-500/30">POST pipeline.ingestPage</Badge>
              </CardTitle>
              <CardDescription>Call after PDF-to-PNG conversion. Detects duplicates via perceptual hash.</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={INGEST_EXAMPLE} />
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-green-500" />
                2. Submit OCR Result
                <Badge className="ml-auto bg-green-500/20 text-green-400 border-green-500/30">POST pipeline.submitOcrResult</Badge>
              </CardTitle>
              <CardDescription>
                Call after two-pass OCR. Pages with confidence &lt; 70 are auto-flagged to the HITL queue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={OCR_SUBMIT_EXAMPLE} />
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-red-500" />
                3. Manually Flag a Page
                <Badge className="ml-auto bg-red-500/20 text-red-400 border-red-500/30">POST pipeline.flagPage</Badge>
              </CardTitle>
              <CardDescription>Use for consensus failures, model disagreements, or other quality issues.</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={FLAG_EXAMPLE} />
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-blue-500" />
                4. Upload a PDF Document
                <Badge className="ml-auto bg-blue-500/20 text-blue-400 border-blue-500/30">POST /api/upload/document</Badge>
              </CardTitle>
              <CardDescription>Multipart form upload. Validates PDF magic bytes. Max 10 MB.</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={UPLOAD_EXAMPLE} />
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-500" />
                Python Helper Pattern
              </CardTitle>
              <CardDescription>Reusable wrapper for calling tRPC procedures from Python scripts.</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={PYTHON_EXAMPLE} language="python" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Data Schema ── */}
        <TabsContent value="schema" className="space-y-6 mt-6">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Key Database Tables
              </CardTitle>
              <CardDescription>MySQL schema managed by Drizzle ORM. Run <code className="bg-muted px-1 rounded text-xs">pnpm db:push</code> after schema changes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 pr-4 font-medium">Table</th>
                      <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                      <th className="text-left py-2 font-medium">Key Columns</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    {[
                      ["users", "Authenticated users", "openId, role (admin/user)"],
                      ["llm_providers", "Cloud/local LLM configs", "providerType, baseUrl, encryptedApiKey, keyPrefix, keySuffix"],
                      ["model_assignments", "Stage → model mapping", "pipelineStage, providerId, modelName, isActive"],
                      ["db_connections", "External DB configs", "connectionType, host, encryptedPassword"],
                      ["system_prompts", "Versioned pipeline prompts", "name, category, promptText, version"],
                      ["ingestion_jobs", "PDF ingestion tracking", "status, sourceType, totalPages, processedPages"],
                      ["telemetry_events", "Cost & usage events", "eventType, source, metricValue, costMicros"],
                      ["documents", "Source PDF metadata", "name, gameSystem, pageCount, status, ownerUserId"],
                      ["document_pages", "Per-page images", "documentId, pageNumber, imageUrl, phash, ocrCompleted"],
                      ["ocr_results", "Extracted text & data", "pageId, rawText, structuredData, confidence, status"],
                      ["hitl_queue", "Human review queue", "pageId, reason, priority, status, resolvedBy"],
                    ].map(([table, purpose, cols]) => (
                      <tr key={table} className="border-b border-border/30">
                        <td className="py-2 pr-4 font-mono text-xs text-foreground">{table}</td>
                        <td className="py-2 pr-4">{purpose}</td>
                        <td className="py-2 font-mono text-xs">{cols}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                OCR Result Status Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {["pending", "pass1_complete", "pass2_complete", "validated", "corrected", "failed"].map((s, i, arr) => (
                  <span key={s} className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{s}</Badge>
                    {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Pages with confidence &lt; 70 after <code className="bg-muted px-1 rounded">pass2_complete</code> are automatically flagged to the HITL queue with <code className="bg-muted px-1 rounded">medium</code> priority.
                Human corrections set status to <code className="bg-muted px-1 rounded">corrected</code>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security ── */}
        <TabsContent value="security" className="space-y-6 mt-6">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Security Architecture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                {[
                  {
                    title: "AES-256-GCM Credential Encryption",
                    desc: "All API keys and database passwords are encrypted at rest using AES-256-GCM with a dedicated CREDENTIAL_ENCRYPTION_KEY (separate from the session JWT_SECRET). The encryption key never leaves the server.",
                  },
                  {
                    title: "Secret Display Hints (No Decrypt for Lists)",
                    desc: "When an API key is saved, the first 4 and last 4 characters are stored as keyPrefix/keySuffix alongside the key length. List views render masked keys (e.g. sk-ab••••••ef) using these hints — no decryption required.",
                  },
                  {
                    title: "Auth Before File Parsing",
                    desc: "The /api/upload/document endpoint authenticates the request before Multer parses the multipart body. Unauthenticated requests are rejected before any file data is read.",
                  },
                  {
                    title: "PDF Magic-Byte Validation",
                    desc: "Uploaded files are validated against the PDF magic bytes (%PDF-) after parsing. Files with a .pdf extension but non-PDF content are rejected with 400.",
                  },
                  {
                    title: "Admin-Only Mutations",
                    desc: "Prompt mutations (upsert, seedDefaults) and telemetry writes are restricted to admin users. This prevents regular users from injecting malicious instructions into the OCR pipeline or flooding the telemetry table.",
                  },
                  {
                    title: "Health Endpoint Split",
                    desc: "GET /api/trpc/health.ping returns only { ok: true } and is public (safe for load balancer checks). Detailed health info (/health.database, /health.all) requires authentication.",
                  },
                  {
                    title: "1 MB Global Body Limit",
                    desc: "JSON and URL-encoded request bodies are capped at 1 MB. File uploads use their own Multer limit (10 MB PDF cap) on the /api/upload/* routes only.",
                  },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex gap-3">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">{title}</p>
                      <p className="text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-500" />
                Required Environment Variables
              </CardTitle>
              <CardDescription>These must be set before the server will start.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-muted/30 rounded border border-border/50">
                  <p className="font-mono text-xs font-medium text-foreground">JWT_SECRET</p>
                  <p className="text-muted-foreground mt-1">Session cookie signing secret. Minimum 32 characters. Generate with: <code className="bg-muted px-1 rounded text-xs">openssl rand -hex 32</code></p>
                </div>
                <div className="p-3 bg-muted/30 rounded border border-border/50">
                  <p className="font-mono text-xs font-medium text-foreground">CREDENTIAL_ENCRYPTION_KEY</p>
                  <p className="text-muted-foreground mt-1">AES-256-GCM key for stored API keys. Must be different from JWT_SECRET. Minimum 32 characters. <strong className="text-amber-400">Changing this invalidates all existing encrypted secrets.</strong></p>
                </div>
                <div className="p-3 bg-muted/30 rounded border border-border/50">
                  <p className="font-mono text-xs font-medium text-foreground">DATABASE_URL</p>
                  <p className="text-muted-foreground mt-1">MySQL-compatible connection string. TiDB and MySQL 8+ are supported.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Search Guide ── */}
        <TabsContent value="search" className="space-y-6 mt-6">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Book className="w-5 h-5 text-primary" />
                Words of Power — Search Syntax
              </CardTitle>
              <CardDescription>Master the natural language query engine in Listen to Ramblings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The search bar supports complex natural language queries powered by the hybrid RAG system.
                Queries are matched against both semantic embeddings and structured metadata.
              </p>
              <div className="space-y-2">
                {[
                  "Show me all undead creatures with a CR greater than 10",
                  "List evocation spells that deal fire damage",
                  "Find magic items that require attunement by a spellcaster",
                  "What are the saving throw DCs for dragon breath weapons?",
                  "Show me all tables from the Dungeon Master's Guide chapter 5",
                  "Find all stat blocks where the creature has legendary actions",
                ].map((q) => (
                  <div key={q} className="p-2 bg-muted/20 rounded border border-border/50 font-mono text-xs text-foreground">
                    "{q}"
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: Be specific about the game system and source book for more accurate results.
                The RAG system uses Small-to-Big retrieval — it finds the most relevant passage and then returns the full surrounding context.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
