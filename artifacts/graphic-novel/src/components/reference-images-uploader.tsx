import { useState, useRef } from "react";
import { Plus, X, Image as ImageIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface ReferenceImage {
  label: string;
  dataUrl: string;
}

interface Props {
  images: ReferenceImage[];
  onChange: (images: ReferenceImage[]) => void;
  required?: boolean;
}

export function ReferenceImagesUploader({ images, onChange, required = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === "string") {
        setPendingImage(e.target.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleAdd = () => {
    if (pendingImage && pendingLabel) {
      onChange([...images, { label: pendingLabel, dataUrl: pendingImage }]);
      setPendingImage(null);
      setPendingLabel("");
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {images.map((img, i) => (
            <div key={i} className="relative group border-2 border-border p-1 bg-card">
              <img src={img.dataUrl} alt={img.label} className="w-full aspect-square object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2">
                <p className="text-white text-xs font-mono truncate">{img.label}</p>
              </div>
              <button
                type="button"
                className="absolute -top-2 -right-2 bg-destructive text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(i)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-end border-2 border-dashed border-border p-4">
        <div className="flex-1 w-full space-y-2">
          {pendingImage ? (
            <div className="relative w-32 aspect-square border-2 border-primary overflow-hidden">
              <img src={pendingImage} alt="Pending" className="w-full h-full object-cover" />
              <button
                type="button"
                className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full"
                onClick={() => setPendingImage(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div 
              className="w-32 aspect-square border-2 border-dashed border-muted-foreground/50 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:text-primary transition-colors text-muted-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="w-8 h-8 mb-2" />
              <span className="text-xs font-bold uppercase tracking-wider">Select Image</span>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileSelect}
          />
        </div>
        <div className="flex-1 w-full flex gap-2">
          <Input 
            placeholder="Label (e.g. 'Main Character')" 
            value={pendingLabel}
            onChange={(e) => setPendingLabel(e.target.value)}
            disabled={!pendingImage}
            className="font-mono text-sm"
          />
          <Button 
            type="button"
            onClick={handleAdd}
            disabled={!pendingImage || !pendingLabel}
          >
            <Plus className="w-4 h-4 mr-2" /> Add
          </Button>
        </div>
      </div>
      {required && images.length === 0 && (
        <p className="text-sm text-destructive font-mono">* At least one reference image is required</p>
      )}
    </div>
  );
}
