import { Switch, Route } from "wouter";
import { ThemeProvider } from "@/hooks/use-theme";
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

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ttrpg-theme">
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
