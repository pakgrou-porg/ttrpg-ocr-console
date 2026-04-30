import { Switch, Route } from "wouter";
import { ThemeProvider } from "@/hooks/use-theme";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import UsingData from "@/pages/UsingData";
import PerusingData from "@/pages/PerusingData";
import HowToUse from "@/pages/HowToUse";
import MonitoringJobs from "@/pages/MonitoringJobs";
import UsageStats from "@/pages/UsageStats";
import ConfigSystems from "@/pages/ConfigSystems";
import ConfigContent from "@/pages/ConfigContent";
import ConfigPrompts from "@/pages/ConfigPrompts";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ttrpg-theme">
      <Layout>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/using-data" component={UsingData} />
          <Route path="/perusing-data" component={PerusingData} />
          <Route path="/how-to-use" component={HowToUse} />
          <Route path="/monitoring-jobs" component={MonitoringJobs} />
          <Route path="/usage-stats" component={UsageStats} />
          <Route path="/config-systems" component={ConfigSystems} />
          <Route path="/config-content" component={ConfigContent} />
          <Route path="/config-prompts" component={ConfigPrompts} />
          <Route>
            <div className="flex flex-col items-center justify-center h-full text-center">
              <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
              <p className="text-muted-foreground">The arcane knowledge you seek is not here.</p>
            </div>
          </Route>
        </Switch>
      </Layout>
    </ThemeProvider>
  );
}

export default App;
