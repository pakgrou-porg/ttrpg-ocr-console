import { Switch, Route } from "wouter";
import { ThemeProvider } from "@/hooks/use-theme";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import Setup from "@/pages/Setup";
import Monitoring from "@/pages/Monitoring";
import ArchivistDesk from "@/pages/ArchivistDesk";
import AdminCorrection from "@/pages/AdminCorrection";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ttrpg-theme">
      <Layout>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/setup" component={Setup} />
          <Route path="/monitoring" component={Monitoring} />
          <Route path="/archivist" component={ArchivistDesk} />
          <Route path="/admin" component={AdminCorrection} />
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
