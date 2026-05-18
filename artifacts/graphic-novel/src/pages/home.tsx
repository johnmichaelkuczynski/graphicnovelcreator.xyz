import { Link, useLocation } from "wouter";
import { PenTool, Image as ImageIcon, FileText, ArrowRight, Library, BookOpen } from "lucide-react";
import { useListNovels, useListScreenplays } from "@workspace/api-client-react";
import { format } from "date-fns";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: novels = [], isLoading: isLoadingNovels } = useListNovels();
  const { data: screenplays = [], isLoading: isLoadingScreenplays } = useListScreenplays();

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">
      
      <section className="space-y-6 text-center max-w-3xl mx-auto">
        <h1 className="text-6xl md:text-8xl font-serif font-black tracking-tighter uppercase leading-[0.9] uppercase">
          Graphic <br/> <span className="text-primary">Novel</span> <br/> Generator
        </h1>
        <p className="text-xl font-mono text-muted-foreground uppercase tracking-widest">
          Turn essays & stories into illustrated masterpieces
        </p>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <div 
          onClick={() => setLocation('/novel/new')}
          className="group cursor-pointer border-4 border-border p-8 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]"
        >
          <PenTool className="w-12 h-12 mb-6" />
          <h2 className="text-2xl font-bold font-serif mb-4">Text to Graphic Novel</h2>
          <p className="font-mono text-sm opacity-80 mb-6">Convert any essay or story into a fully illustrated graphic novel.</p>
          <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
        </div>

        <div 
          onClick={() => setLocation('/screenplay/new')}
          className="group cursor-pointer border-4 border-border p-8 hover:bg-foreground hover:text-background hover:border-foreground transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]"
        >
          <FileText className="w-12 h-12 mb-6" />
          <h2 className="text-2xl font-bold font-serif mb-4">Text to Screenplay</h2>
          <p className="font-mono text-sm opacity-80 mb-6">Format your narrative into a professional comic screenplay.</p>
          <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
        </div>

        <div 
          onClick={() => setLocation('/image-novel')}
          className="group cursor-pointer border-4 border-border p-8 hover:bg-secondary hover:border-secondary-foreground transition-all duration-300 transform hover:-translate-y-2 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]"
        >
          <ImageIcon className="w-12 h-12 mb-6" />
          <h2 className="text-2xl font-bold font-serif mb-4">Image to Novel</h2>
          <p className="font-mono text-sm opacity-80 mb-6">Use an image as the seed for your next graphic narrative.</p>
          <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-12">
        <section className="space-y-6 border-t-4 border-border pt-8">
          <div className="flex items-center gap-4">
            <BookOpen className="w-8 h-8" />
            <h2 className="text-3xl font-bold font-serif uppercase">Recent Novels</h2>
          </div>
          
          {isLoadingNovels ? (
            <div className="animate-pulse space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-24 bg-muted border-2 border-border" />)}
            </div>
          ) : novels.length === 0 ? (
            <p className="font-mono text-muted-foreground">No novels created yet.</p>
          ) : (
            <div className="space-y-4">
              {novels.map(novel => (
                <Link key={novel.id} href={`/novel/${novel.id}`}>
                  <a className="block border-2 border-border p-4 hover:bg-muted transition-colors flex gap-4">
                    {novel.coverImage ? (
                      <img src={novel.coverImage} className="w-16 h-16 object-cover border-2 border-border" />
                    ) : (
                      <div className="w-16 h-16 bg-secondary border-2 border-border flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-lg">{novel.title || 'Untitled'}</h3>
                      <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground mt-2">
                        <span className="uppercase tracking-wider">{novel.status}</span>
                        <span>{novel.completedPanels} / {novel.panelCount} panels</span>
                        <span>{format(new Date(novel.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6 border-t-4 border-border pt-8">
          <div className="flex items-center gap-4">
            <Library className="w-8 h-8" />
            <h2 className="text-3xl font-bold font-serif uppercase">Recent Screenplays</h2>
          </div>
          
          {isLoadingScreenplays ? (
            <div className="animate-pulse space-y-4">
              {[1,2].map(i => <div key={i} className="h-20 bg-muted border-2 border-border" />)}
            </div>
          ) : screenplays.length === 0 ? (
            <p className="font-mono text-muted-foreground">No screenplays created yet.</p>
          ) : (
            <div className="space-y-4">
              {screenplays.map(sp => (
                <Link key={sp.id} href={`/screenplay/${sp.id}`}>
                  <a className="block border-2 border-border p-4 hover:bg-muted transition-colors">
                    <h3 className="font-bold text-lg">{sp.title || 'Untitled'}</h3>
                    <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground mt-2">
                      <span>{sp.textModel}</span>
                      <span>{format(new Date(sp.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
