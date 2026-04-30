import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Server, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const performanceData = [
  { time: '00:00', gemini: 0.96, claude: 0.94, gpt4o: 0.92, c_final: 0.95 },
  { time: '04:00', gemini: 0.97, claude: 0.95, gpt4o: 0.93, c_final: 0.96 },
  { time: '08:00', gemini: 0.95, claude: 0.93, gpt4o: 0.91, c_final: 0.94 },
  { time: '12:00', gemini: 0.98, claude: 0.96, gpt4o: 0.94, c_final: 0.97 },
  { time: '16:00', gemini: 0.94, claude: 0.92, gpt4o: 0.90, c_final: 0.93 },
  { time: '20:00', gemini: 0.96, claude: 0.95, gpt4o: 0.93, c_final: 0.95 },
];

const throughputData = [
  { day: 'Mon', pages: 1200, errors: 45 },
  { day: 'Tue', pages: 1500, errors: 30 },
  { day: 'Wed', pages: 1100, errors: 55 },
  { day: 'Thu', pages: 1800, errors: 20 },
  { day: 'Fri', pages: 1600, errors: 25 },
  { day: 'Sat', pages: 800, errors: 15 },
  { day: 'Sun', pages: 950, errors: 10 },
];

export default function Monitoring() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Activity className="w-10 h-10 text-primary" />
          Monitoring & Telemetry
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Real-time insights into pipeline throughput, ensemble model consensus scores, and ingestion queue status.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Server className="w-4 h-4" /> Total Pages Processed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">8,950</div>
            <p className="text-xs text-muted-foreground mt-1">+12% from last week</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> Avg C_final Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-green-500">0.952</div>
            <p className="text-xs text-muted-foreground mt-1">Target: &gt;= 0.95</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" /> Processing Speed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">45 <span className="text-lg text-muted-foreground">pg/min</span></div>
            <p className="text-xs text-muted-foreground mt-1">Local VLM bottleneck</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" /> HITL Flag Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-orange-500">4.2%</div>
            <p className="text-xs text-muted-foreground mt-1">375 pages in queue</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Consensus Performance Chart */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Ensemble Consensus (24h)</CardTitle>
            <CardDescription>Average confidence scores across the model ensemble.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis domain={[0.85, 1]} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--popover-foreground)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="c_final" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} name="C_final (Consensus)" />
                <Line type="monotone" dataKey="gemini" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Gemini 2.5 Pro" />
                <Line type="monotone" dataKey="claude" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Claude 3.5 Sonnet" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Throughput Chart */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Weekly Throughput</CardTitle>
            <CardDescription>Pages processed vs. errors encountered.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={throughputData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                />
                <Legend />
                <Bar dataKey="pages" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Pages Processed" />
                <Bar dataKey="errors" fill="var(--destructive)" radius={[4, 4, 0, 0]} name="Errors / Flags" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ingestion Queue Table */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Active Ingestion Queue</CardTitle>
            <CardDescription>Current status of PDF processing batches.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-md">Batch ID</th>
                    <th className="px-4 py-3">Source File</th>
                    <th className="px-4 py-3">Pages</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 rounded-tr-md">Est. Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono">B-7842</td>
                    <td className="px-4 py-3 font-medium">Monster_Manual_v3.pdf</td>
                    <td className="px-4 py-3">352</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        Processing (Pass 2)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">14 mins</td>
                  </tr>
                  <tr className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono">B-7843</td>
                    <td className="px-4 py-3 font-medium">Arcane_Compendium.pdf</td>
                    <td className="px-4 py-3">128</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                        Binarization
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">22 mins</td>
                  </tr>
                  <tr className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono">B-7841</td>
                    <td className="px-4 py-3 font-medium">DM_Guide_Revised.pdf</td>
                    <td className="px-4 py-3">280</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Completed
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
