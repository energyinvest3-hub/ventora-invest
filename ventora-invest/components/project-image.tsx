"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Wind } from "lucide-react";

type Props = {
  projectId: string;
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
};

// Fotografia no lugar dos SVGs antigos e das imagens problemáticas.
// Mantém os nomes usados pelo Supabase e dispensa alterações no banco.
const photoByProject: Record<string, string> = {
  "chapada-branca": "/ventora-chapada-branca.jpg",
  "litoral-potiguar": "/ventora-litoral-potiguar.jpg",
  "bahia-vento-forte": "/ventora-bahia-vento-forte.jpg",
  "sertao-premium": "/wind-serra.png",
  "rio-grande-wind": "/wind-vales.png",
  "pampa-prime": "/wind-campos.png",
};

function safeLocalPath(path: string): string | null {
  if (!path || !/^\/[A-Za-z0-9_./-]+\.(png|jpe?g|webp|svg)$/i.test(path)) return null;
  if (path.includes("..")) return null;
  return path;
}

export function ProjectImage({ projectId, src, alt, sizes, priority = false }: Props) {
  const options = useMemo(() => {
    const paths = [
      photoByProject[projectId],
      safeLocalPath(src),
      "/wind-vales.png",
      "/wind-litoral.png",
      "/wind-hero.png",
    ].filter((path): path is string => Boolean(path));
    return Array.from(new Set(paths));
  }, [projectId, src]);

  const [imageIndex, setImageIndex] = useState(0);
  useEffect(() => setImageIndex(0), [options]);

  if (imageIndex >= options.length) {
    return (
      <div role="img" aria-label={alt} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0e4853, #3d9f97)", color: "#fff" }}>
        <Wind size={64} strokeWidth={1.4} />
      </div>
    );
  }

  return (
    <Image
      key={options[imageIndex]}
      src={options[imageIndex]}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized
      onError={() => setImageIndex((index) => index + 1)}
    />
  );
}
