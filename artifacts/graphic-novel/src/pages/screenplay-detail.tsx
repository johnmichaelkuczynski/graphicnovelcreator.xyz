import { useLocation, useParams } from "wouter";
import { useGetScreenplay, getGetScreenplayQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Download, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function ScreenplayDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: screenplay, isLoading, error } = useGetScreenplay(Number(id), {
    query: {
      enabled: !!id,
      queryKey: getGetScreenplayQueryKey(Number(id)),
    }
  });

  const handleDownload = () => {
    if (!screenplay) return;
    const blob = new Blob([screenplay.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${screenplay.title || 'Screenplay'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <h2 className="text-xl font-mono uppercase tracking-widest">Loading Screenplay...</h2>
      </div>
    );
  }

  if (error || !screenplay) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
        <h1 className="text-3xl font-black uppercase">Failed to load screenplay</h1>
        <Button onClick={() => setLocation("/")} variant="outline">Return Home</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-12">
        <Button variant="ghost" className="font-mono uppercase tracking-wider" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Library
        </Button>
        <Button onClick={handleDownload} className="font-bold uppercase tracking-widest">
          <Download className="w-4 h-4 mr-2" /> Download .txt
        </Button>
      </div>

      <header className="mb-16 text-center space-y-6">
        <h1 className="text-5xl md:text-7xl font-serif font-black uppercase leading-tight">
          {screenplay.title || "Untitled Screenplay"}
        </h1>
        <div className="font-mono text-sm uppercase tracking-widest text-muted-foreground flex justify-center gap-4 border-y-4 border-border py-4">
          <span>{screenplay.textModel}</span>
          <span>•</span>
          <span>{format(new Date(screenplay.createdAt), 'MMMM yyyy')}</span>
        </div>
      </header>

      <div className="bg-background border-4 border-border p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]">
        <pre className="font-mono whitespace-pre-wrap text-sm md:text-base leading-relaxed break-words">
          {screenplay.content}
        </pre>
      </div>
    </div>
  );
}
