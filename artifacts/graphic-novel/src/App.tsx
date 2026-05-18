import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import NovelNew from "@/pages/novel-new";
import NovelDetail from "@/pages/novel-detail";
import ScreenplayNew from "@/pages/screenplay-new";
import ScreenplayDetail from "@/pages/screenplay-detail";
import ImageNovelNew from "@/pages/image-novel-new";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/novel/new" component={NovelNew} />
      <Route path="/novel/:id" component={NovelDetail} />
      <Route path="/screenplay/new" component={ScreenplayNew} />
      <Route path="/screenplay/:id" component={ScreenplayDetail} />
      <Route path="/image-novel" component={ImageNovelNew} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
            <main className="flex-1">
              <Router />
            </main>
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
