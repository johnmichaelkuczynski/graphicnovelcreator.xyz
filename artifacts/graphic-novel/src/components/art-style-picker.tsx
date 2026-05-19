import { ART_STYLES } from "@/lib/art-styles";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function ArtStylePicker({ value, onChange }: Props) {
  const matchedId = ART_STYLES.find((s) => s.prompt === value)?.id;

  return (
    <div className="flex flex-wrap gap-2">
      {ART_STYLES.map((style) => {
        const active = matchedId === style.id;
        return (
          <button
            key={style.id}
            type="button"
            onClick={() => onChange(style.prompt)}
            className={cn(
              "px-3 py-1.5 border-2 font-mono text-xs uppercase tracking-wider transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted",
            )}
            data-testid={`art-style-${style.id}`}
          >
            {style.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange("")}
        className="px-3 py-1.5 border-2 border-dashed border-border bg-background hover:bg-muted font-mono text-xs uppercase tracking-wider"
        data-testid="art-style-clear"
      >
        Clear / Custom
      </button>
    </div>
  );
}
