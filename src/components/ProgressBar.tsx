interface ProgressBarProps {
  percent: number;
  label?: string;
  sublabel?: string;
  size?: "sm" | "md";
}

export function ProgressBar({ percent, label, sublabel, size = "md" }: ProgressBarProps) {
  const barHeight = size === "sm" ? "h-1.5" : "h-2";

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between mb-2 text-[13px]">
          <span className="text-text-primary">{label}</span>
          <span className="text-text-secondary mono">{percent.toFixed(1)}%</span>
        </div>
      )}
      <div className={`w-full ${barHeight} bg-bg-tertiary rounded-full overflow-hidden`}>
        <div
          className="h-full bg-accent rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      {sublabel && (
        <div className="mt-1.5 text-[12px] text-text-tertiary">{sublabel}</div>
      )}
    </div>
  );
}
