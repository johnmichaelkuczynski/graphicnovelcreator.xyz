import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";

interface Props {
  onFile: (file: File | null) => void;
  className?: string;
}

const ACCEPT =
  "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/*,.mp3,.wav";

function isAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".mp3") || name.endsWith(".wav")) return true;
  if (file.type.startsWith("audio/")) return true;
  return false;
}

export function AudioDropzone({ onFile, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reject, setReject] = useState("");

  const handleFiles = (files: FileList | null) => {
    setReject("");
    const f = files?.[0];
    if (!f) return;
    if (!isAudioFile(f)) {
      setReject("Only MP3 or WAV files are accepted.");
      return;
    }
    onFile(f);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className={className}>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed p-6 cursor-pointer font-mono text-sm select-none transition-colors ${
          dragging
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/60 hover:bg-muted/40"
        }`}
        data-testid="audio-dropzone"
      >
        <Upload className="w-6 h-6" />
        <div className="font-bold uppercase tracking-wider">
          {dragging ? "Drop MP3 or WAV" : "Drop MP3 or WAV here"}
        </div>
        <div className="text-xs text-muted-foreground">
          or click to choose a file
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>
      {reject && (
        <p className="font-mono text-xs text-destructive mt-2">{reject}</p>
      )}
    </div>
  );
}
