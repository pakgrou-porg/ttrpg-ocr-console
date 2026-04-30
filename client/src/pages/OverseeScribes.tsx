import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, CheckCircle2, AlertCircle, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OverseeScribes() {
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
            <div className="text-3xl font-bold font-mono">3</div>
            <p className="text-xs text-muted-foreground mt-1">2 processing, 1 queued</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> Transcribed Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-green-500">12</div>
            <p className="text-xs text-muted-foreground mt-1">1,450 pages total</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" /> Scribe Queries (HITL)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-orange-500">14</div>
            <p className="text-xs text-muted-foreground mt-1">Requires manual review</p>
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
            <Button variant="outline" size="sm" className="gap-2">
              <RotateCcw className="w-4 h-4" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 rounded-tl-md">Job ID</th>
                  <th className="px-4 py-3">Source File</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-md">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono">JOB-892</td>
                  <td className="px-4 py-3 font-medium">Monster_Manual_v3.pdf</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-muted rounded-full h-2 max-w-[100px]">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: '65%' }}></div>
                      </div>
                      <span className="text-xs font-mono">65%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                      Pass 2 (Cloud OCR)
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive">Cancel</Button>
                  </td>
                </tr>
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono">JOB-893</td>
                  <td className="px-4 py-3 font-medium">Arcane_Compendium.pdf</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-muted rounded-full h-2 max-w-[100px]">
                        <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '15%' }}></div>
                      </div>
                      <span className="text-xs font-mono">15%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                      Binarization
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive">Cancel</Button>
                  </td>
                </tr>
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono">JOB-894</td>
                  <td className="px-4 py-3 font-medium">Tome_of_Beasts.pdf</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-muted rounded-full h-2 max-w-[100px]">
                        <div className="bg-muted-foreground h-2 rounded-full" style={{ width: '0%' }}></div>
                      </div>
                      <span className="text-xs font-mono">0%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground border border-border/50">
                      Queued
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-primary">Start Now</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
