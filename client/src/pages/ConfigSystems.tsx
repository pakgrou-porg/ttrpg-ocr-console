import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, Server, Cpu, Key } from "lucide-react";

export default function ConfigSystems() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Settings className="w-10 h-10 text-primary" />
          Systems & Tools
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Configure connections to your local models, database, and external APIs.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Database Configuration */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              Database Connection
            </CardTitle>
            <CardDescription>Supabase PostgREST endpoint and credentials.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="supabase-url">Supabase URL</Label>
              <Input id="supabase-url" defaultValue="http://localhost:8000" className="font-mono bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supabase-key">Service Role Key</Label>
              <Input id="supabase-key" type="password" defaultValue="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." className="font-mono bg-background/50" />
            </div>
            <Button className="w-full gap-2 mt-4">
              <Save className="w-4 h-4" />
              Save Database Config
            </Button>
          </CardContent>
        </Card>

        {/* Local Model Configuration */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Cpu className="w-5 h-5 text-primary" />
              Local Models (LM Studio)
            </CardTitle>
            <CardDescription>Configure your local Vision-Language Models for Pass 1 OCR.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="lm-studio-url">LM Studio API Endpoint</Label>
              <Input id="lm-studio-url" defaultValue="http://localhost:1234/v1" className="font-mono bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vlm-model-name">Primary VLM Name</Label>
              <Input id="vlm-model-name" defaultValue="llava-v1.5-7b-q4_k" className="font-mono bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vlm-temperature">Temperature</Label>
              <Input id="vlm-temperature" type="number" step="0.1" defaultValue="0.2" className="font-mono bg-background/50" />
            </div>
            <Button className="w-full gap-2 mt-4">
              <Save className="w-4 h-4" />
              Save Local Model Config
            </Button>
          </CardContent>
        </Card>

        {/* External APIs */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              External APIs (OpenRouter)
            </CardTitle>
            <CardDescription>API keys for cloud-based LLMs used in Pass 2 consensus.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="openrouter-key">OpenRouter API Key</Label>
                <Input id="openrouter-key" type="password" defaultValue="sk-or-v1-..." className="font-mono bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="n8n-webhook">n8n Webhook URL (Optional)</Label>
                <Input id="n8n-webhook" defaultValue="http://localhost:5678/webhook/..." className="font-mono bg-background/50" />
              </div>
            </div>
            
            <div className="pt-4 border-t border-border/50">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Ensemble Model Weights</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base">Gemini 2.5 Pro</Label>
                    <span className="font-mono text-primary">0.45</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" defaultValue="0.45" className="w-full accent-primary" />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base">Claude 3.5 Sonnet</Label>
                    <span className="font-mono text-primary">0.35</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" defaultValue="0.35" className="w-full accent-primary" />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base">GPT-4o</Label>
                    <span className="font-mono text-primary">0.20</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.05" defaultValue="0.20" className="w-full accent-primary" />
                </div>
              </div>
            </div>
            
            <Button className="w-full gap-2 mt-4">
              <Save className="w-4 h-4" />
              Save API Config
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
