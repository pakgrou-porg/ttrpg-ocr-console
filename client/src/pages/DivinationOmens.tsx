import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, TrendingUp, Users, Database, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { trpc } from "@/lib/trpc";

export default function DivinationOmens() {
  const { data: telemetry, isLoading } = trpc.telemetry.summary.useQuery(undefined, {
    refetchInterval: 60000,
  });

  // Derive chart data from modelBreakdown
  const modelData = telemetry?.modelBreakdown ?? [];
  const chartData = modelData.map((m) => ({
    name: m.source.length > 20 ? m.source.substring(0, 20) + '…' : m.source,
    count: m.count,
    avgLatency: m.avgMetric,
    cost: m.totalCost / 1_000_000,
  }));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <BarChart2 className="w-10 h-10 text-primary" />
          Divination & Omens
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Telemetry and performance metrics for the OCR pipeline and database queries. Read the signs to optimize the flow of knowledge.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Database className="w-4 h-4" /> Total Lore Fragments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-3xl font-bold font-mono">{(telemetry?.totalEvents ?? 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">{telemetry?.modelBreakdown?.length ?? 0} models tracked</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" /> Total Cloud Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-3xl font-bold font-mono text-green-500">${((telemetry?.totalCostMicros ?? 0) / 1_000_000).toFixed(4)}</div>
                <p className="text-xs text-muted-foreground mt-1">Avg latency: {telemetry?.avgLatency ?? 0}ms</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" /> Model Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-3xl font-bold font-mono text-blue-500">{telemetry?.modelBreakdown?.length ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Distinct model sources</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Query Volume Chart */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Model Invocations</CardTitle>
            <CardDescription>Invocation count and average latency by model source.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--popover-foreground)' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} name="Invocations" />
                  <Line type="monotone" dataKey="avgLatency" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Avg Latency (ms)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Database Composition Chart */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Cost by Model</CardTitle>
            <CardDescription>Cloud spend distribution by model source.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                    cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                  />
                  <Bar dataKey="cost" fill="var(--primary)" radius={[0, 4, 4, 0]} name="Cost ($)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
