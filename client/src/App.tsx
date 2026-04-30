import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Layout } from "@/components/Layout";
import { PermissionGate } from "@/components/PermissionGate";
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
import TheConclave from "@/pages/TheConclave";
import TheArtificers from "@/pages/TheArtificers";
import TheAssignments from "@/pages/TheAssignments";
import TheVaultNexus from "@/pages/TheVaultNexus";
import ArchivistsDesk from "@/pages/ArchivistsDesk";
import NotFound from "@/pages/NotFound";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/enter-arkanum">
          <PermissionGate featureArea="enter_arkanum">
            <EnterArkanum />
          </PermissionGate>
        </Route>
        <Route path="/listen-ramblings">
          <PermissionGate featureArea="listen_ramblings">
            <ListenRamblings />
          </PermissionGate>
        </Route>
        <Route path="/tome-knowledge">
          <PermissionGate featureArea="tome_knowledge">
            <TomeKnowledge />
          </PermissionGate>
        </Route>
        <Route path="/divination-omens">
          <PermissionGate featureArea="divination_omens">
            <DivinationOmens />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/archivists-desk">
          <PermissionGate featureArea="oversee_scribes">
            <ArchivistsDesk />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/oversee-scribes">
          <PermissionGate featureArea="oversee_scribes">
            <OverseeScribes />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/arcane-mechanisms">
          <PermissionGate featureArea="arcane_mechanisms">
            <ArcaneMechanisms />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/summoning-rituals">
          <PermissionGate featureArea="summoning_rituals">
            <SummoningRituals />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/incantations-runes">
          <PermissionGate featureArea="incantations_runes">
            <IncantationsRunes />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/the-artificers">
          <PermissionGate featureArea="the_conclave">
            <TheArtificers />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/the-assignments">
          <PermissionGate featureArea="the_conclave">
            <TheAssignments />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/vault-nexus">
          <PermissionGate featureArea="the_conclave">
            <TheVaultNexus />
          </PermissionGate>
        </Route>
        <Route path="/inner-sanctum/the-conclave">
          <PermissionGate featureArea="the_conclave">
            <TheConclave />
          </PermissionGate>
        </Route>
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
