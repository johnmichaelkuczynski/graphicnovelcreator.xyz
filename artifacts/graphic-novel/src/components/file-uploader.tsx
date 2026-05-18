import { useState, useRef } from "react";
import { UploadCloud, File, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface FileUploaderProps {
  onExtracted: (text: string) => void;
  className?: string;
}

export function FileUploader({ onExtracted, className }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const baseUrl = import.meta.env.BASE_URL;
      const res = await fetch(`${baseUrl}api/uploads/extract`, {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) throw new Error("Failed to extract text");
      
      const data = await res.json();
      onExtracted(data.text);
    } catch (err) {
      console.error(err);
      // Ideally show a toast
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center p-6 border-2 border-dashed transition-colors",
        isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5",
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".txt,.pdf,.doc,.docx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
        <UploadCloud className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isUploading ? "Extracting text..." : "Drag & drop file or click to upload"}
        </p>
        <p className="text-xs text-muted-foreground">Supports .txt, .pdf, .docx</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
      >
        Upload
      </Button>
    </div>
  );
}
