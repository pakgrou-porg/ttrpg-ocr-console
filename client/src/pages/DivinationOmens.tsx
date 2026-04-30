import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, TrendingUp, Users, Database } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const queryData = [
  { day: 'Mon', queries: 120, apiCalls: 450 },
  { day: 'Tue', queries: 150, apiCalls: 520 },
  { day: 'Wed', queries: 180, apiCalls: 610 },
  { day: 'Thu', queries: 140, apiCalls: 480 },
  { day: 'Fri', queries: 210, apiCalls: 750 },
  { day: 'Sat', queries: 320, apiCalls: 1100 },
  { day: 'Sun', queries: 280, apiCalls: 950 },
];

const categoryData = [
  { name: 'Monsters', count: 4500 },
  { name: 'Spells', count: 2100 },
  { name: 'Items', count: 1800 },
  { name: 'Rules', count: 550 },
];

export default function DivinationOmens() {
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
            <div className="text-3xl font-bold font-mono">8,950</div>
            <p className="text-xs text-muted-foreground mt-1">+12% from last week</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" /> Weekly Divinations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-green-500">1,400</div>
            <p className="text-xs text-muted-foreground mt-1">Peak usage on Saturdays</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" /> Active Grimoires
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-blue-500">24</div>
            <p className="text-xs text-muted-foreground mt-1">Across 5 campaigns</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Query Volume Chart */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Divination Volume (7 Days)</CardTitle>
            <CardDescription>User queries vs. internal API calls.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={queryData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--popover-foreground)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="apiCalls" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} name="API Calls" />
                <Line type="monotone" dataKey="queries" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="User Queries" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Database Composition Chart */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Lore Composition</CardTitle>
            <CardDescription>Distribution of extracted records by category.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                />
                <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} name="Records" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
