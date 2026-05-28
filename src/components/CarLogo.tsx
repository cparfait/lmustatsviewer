import { getCarLogoUrlSync, getCarLogoUrl } from "@/lib/staticData";

interface CarLogoProps {
  carName: string;
  className?: string;
}

export function CarLogo({ carName, className = "h-5 w-auto object-contain opacity-90" }: CarLogoProps) {
  const url = getCarLogoUrlSync(carName);
  if (!url) {
    getCarLogoUrl(carName);
    return null;
  }
  return (
    <img
      src={url}
      alt={carName}
      className={className}
      style={{ maxWidth: "2.5rem" }}
    />
  );
}
