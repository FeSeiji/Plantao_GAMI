type Props = {
  sigla?: string | null
  size?: "sm" | "md"
}

const TAMANHOS = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-9 h-9 text-xs",
}

export default function SiglaBadge({ sigla, size = "md" }: Props) {
  return (
    <div
      title={sigla ?? undefined}
      className={`${TAMANHOS[size]} rounded-full bg-brand-700 text-white font-bold flex items-center justify-center shrink-0 select-none`}
    >
      {sigla ?? "?"}
    </div>
  )
}
