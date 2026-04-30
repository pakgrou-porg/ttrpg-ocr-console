import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, Book, FileText, Video, PlayCircle } from "lucide-react";

export default function HowToUse() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <HelpCircle className="w-10 h-10 text-primary" />
          How to Use This
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Documentation, guides, and tutorials for getting the most out of the TTRPG OCR Pipeline Console.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Book className="w-5 h-5 text-primary" />
              Quick Start Guide
            </CardTitle>
            <CardDescription>Get up and running in 5 minutes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Navigate to <strong>Configuration &gt; Systems & Tools</strong> to verify your database and model connections.</li>
              <li>Go to <strong>Configuration &gt; Content Config</strong> to set up a new import job for your PDFs.</li>
              <li>Monitor the ingestion progress on the <strong>Monitoring Jobs</strong> page.</li>
              <li>Once complete, use <strong>Perusing the Data</strong> to explore the extracted records.</li>
              <li>Save frequently used records in <strong>Using the Data</strong> for quick access during gameplay.</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Advanced Search Syntax
            </CardTitle>
            <CardDescription>Master the natural language query engine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The search bar in "Perusing the Data" supports complex natural language queries. Here are some examples:
            </p>
            <ul className="space-y-2 text-sm">
              <li className="p-2 bg-muted/20 rounded border border-border/50 font-mono">"Show me all undead creatures with a CR greater than 10"</li>
              <li className="p-2 bg-muted/20 rounded border border-border/50 font-mono">"List evocation spells that deal fire damage"</li>
              <li className="p-2 bg-muted/20 rounded border border-border/50 font-mono">"Find magic items that require attunement by a spellcaster"</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              Video Tutorials
            </CardTitle>
            <CardDescription>Visual guides for complex workflows.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="aspect-video bg-muted/30 rounded-md border border-border/50 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group">
                <div className="text-center">
                  <PlayCircle className="w-8 h-8 text-muted-foreground group-hover:text-primary mx-auto mb-2 transition-colors" />
                  <span className="text-sm font-medium">Setting up a new Game System</span>
                </div>
              </div>
              <div className="aspect-video bg-muted/30 rounded-md border border-border/50 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group">
                <div className="text-center">
                  <PlayCircle className="w-8 h-8 text-muted-foreground group-hover:text-primary mx-auto mb-2 transition-colors" />
                  <span className="text-sm font-medium">Resolving HITL Flags</span>
                </div>
              </div>
              <div className="aspect-video bg-muted/30 rounded-md border border-border/50 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors group">
                <div className="text-center">
                  <PlayCircle className="w-8 h-8 text-muted-foreground group-hover:text-primary mx-auto mb-2 transition-colors" />
                  <span className="text-sm font-medium">Creating Custom Groups</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
