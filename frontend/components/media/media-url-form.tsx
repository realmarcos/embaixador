"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ShimmerButton } from "@/components/ui/shimmer-button";

interface MediaUrlFormProps {
  pending: boolean;
  onAnalyze: (url: string) => void;
}

function MediaUrlForm({ pending, onAnalyze }: MediaUrlFormProps) {
  const [url, setUrl] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAnalyze(url.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="media-url" className="block text-sm font-semibold">Link da publicação</label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Link2 aria-hidden="true" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="media-url"
            name="url"
            type="url"
            autoComplete="url"
            required
            maxLength={2048}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
            className="h-11 pl-10 pr-3"
          />
        </div>
        <ShimmerButton
          type="submit"
          disabled={pending || url.trim().length === 0}
          shimmerColor="#ffd000"
          background="#6125ff"
          borderRadius="0.5rem"
          className="h-11 w-full shrink-0 gap-2 border-white/20 px-5 text-sm font-semibold text-white sm:w-auto"
        >
          {pending ? "Analisando..." : "Analisar link"}
          {!pending && <ArrowRight aria-hidden="true" size={17} />}
        </ShimmerButton>
      </div>
    </form>
  );
}

export { MediaUrlForm };