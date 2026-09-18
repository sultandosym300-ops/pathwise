import { useEffect, useState } from "react";

import type { UniversityResearch } from "../lib/admissions";

/**
 * Renders a verified campus image, or a designed fallback that is clearly not
 * pretending to be a photo. Confidence below 0.8 or a load failure both fall back.
 */
export function UniversityImage({ university, className = "" }: { university: Pick<UniversityResearch, "name" | "image">; className?: string }) {
  const image = university.image && university.image.universityMatchConfidence >= 0.8 ? university.image : undefined;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image?.imageUrl]);
  const initials = university.name
    .split(/[\s-]+/)
    .filter((word) => word.length > 2 && !/^(of|the|and|de|for)$/i.test(word))
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  if (!image || failed) {
    return (
      <div className={`uni-fallback ${className}`} role="img" aria-label={`${university.name} placeholder`}>
        <span className="uni-fallback-initials">{initials || "U"}</span>
        <span className="uni-fallback-name">{university.name}</span>
        <span className="uni-fallback-note">Verified photo not available</span>
      </div>
    );
  }
  return (
    <figure className={`uni-photo ${className}`}>
      <img src={image.imageUrl} alt={`${university.name}`} loading="lazy" onError={() => setFailed(true)} />
      <figcaption>
        <a href={image.sourceUrl} target="_blank" rel="noreferrer">{image.attribution}</a>
      </figcaption>
    </figure>
  );
}
