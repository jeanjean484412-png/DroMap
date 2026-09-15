import Image from "next/image";

export function DromapLogoMark({
  className = "h-12 w-auto",
  alt = "Logo DroMap",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/dromap-logo.svg?v=20260915-3"
      alt={alt}
      width={1280}
      height={1143}
      sizes="96px"
      unoptimized
      draggable={false}
      className={className}
    />
  );
}

export function DromapBrandBlock({
  subtitle = "Éditeur cartographique",
  markClassName = "h-12 w-auto",
  titleClassName = "text-[1.65rem] font-black tracking-tight text-[#123a59]",
  subtitleClassName = "text-xs text-slate-500",
  align = "left",
}: {
  subtitle?: string | null;
  markClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  align?: "left" | "center";
}) {
  return (
    <span className={`inline-flex items-center gap-3 ${align === "center" ? "justify-center" : "justify-start"}`}>
      <DromapLogoMark className={markClassName} />
      <span className={`flex flex-col ${align === "center" ? "items-center text-center" : "items-start"}`}>
        <span className={titleClassName}>DroMap</span>
        {subtitle ? <span className={`mt-1 block ${subtitleClassName}`}>{subtitle}</span> : null}
      </span>
    </span>
  );
}
