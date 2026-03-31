import { useState, useRef, useEffect } from "react";
import { ChevronDown, Clock } from "lucide-react";

interface ComboBoxProps {
  value: string;
  onChange: (value: string) => void;
  history: string[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  mono?: boolean;
}

export function ComboBox({
  value,
  onChange,
  history,
  placeholder,
  className = "",
  style,
  mono = false,
}: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = history.filter((item) =>
    item.toLowerCase().includes((open ? filter || value : "").toLowerCase())
  );

  const showDropdown = open && filtered.length > 0;

  return (
    <div ref={containerRef} className="relative" style={{ ...style }}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setFilter(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`w-full ${mono ? "mono" : ""} ${className}`}
          style={{ paddingRight: history.length > 0 ? 32 : undefined }}
        />
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpen(!open);
              inputRef.current?.focus();
            }}
            className="absolute right-0 flex items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors"
            style={{ width: 32, height: "100%" }}
          >
            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {showDropdown && (
        <div
          className="absolute left-0 right-0 bg-bg-elevated border border-border-default rounded-lg shadow-lg overflow-hidden z-50"
          style={{ marginTop: 4, maxHeight: 200, overflowY: "auto" }}
        >
          {filtered.map((item, i) => (
            <button
              key={`${item}-${i}`}
              type="button"
              onClick={() => {
                onChange(item);
                setOpen(false);
              }}
              className={`w-full flex items-center text-left hover:bg-bg-hover transition-colors ${
                item === value ? "bg-accent/10 text-accent" : "text-text-secondary"
              } ${mono ? "mono" : ""}`}
              style={{ gap: 10, padding: "8px 14px", fontSize: 12 }}
            >
              <Clock size={12} className="text-text-tertiary flex-shrink-0" />
              <span className="truncate">{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
