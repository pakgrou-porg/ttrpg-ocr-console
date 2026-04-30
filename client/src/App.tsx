import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import EnterArkanum from "@/pages/EnterArkanum";
import ListenRamblings from "@/pages/ListenRamblings";
import TomeKnowledge from "@/pages/TomeKnowledge";
import OverseeScribes from "@/pages/OverseeScribes";
import DivinationOmens from "@/pages/DivinationOmens";
import ArcaneMechanisms from "@/pages/ArcaneMechanisms";
import SummoningRituals from "@/pages/SummoningRituals";
import IncantationsRunes from "@/pages/IncantationsRunes";
import PersonalSanctum from "@/pages/PersonalSanctum";
import NotFound from "@/pages/NotFound";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/enter-arkanum" component={EnterArkanum} />
        <Route path="/listen-ramblings" component={ListenRamblings} />
        <Route path="/tome-knowledge" component={TomeKnowledge} />
        <Route path="/oversee-scribes" component={OverseeScribes} />
        <Route path="/divination-omens" component={DivinationOmens} />
        <Route path="/arcane-mechanisms" component={ArcaneMechanisms} />
        <Route path="/summoning-rituals" component={SummoningRituals} />
        <Route path="/incantations-runes" component={IncantationsRunes} />
        <Route path="/personal-sanctum" component={PersonalSanctum} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
