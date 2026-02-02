interface WaveformProps {
  data: number[];
  progress?: number;
  onSeek?: (progress: number) => void;
  height?: string;
  color?: string;
  activeColor?: string;
  interactive?: boolean;
}

export function Waveform({ 
    data, 
    progress = 0, 
    onSeek, 
    height = "h-8", 
    color = "bg-gray-700", 
    activeColor = "bg-blue-500",
    interactive = true
}: WaveformProps) {
  // Defensive check
  const bars = Array.isArray(data) ? data : [];
  
  if (bars.length === 0) return null;

  return (
    <div 
      className={`flex items-center gap-0.5 w-full ${height} ${interactive ? 'cursor-pointer group' : ''}`}
      onClick={(e) => {
        if (!interactive || !onSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const p = x / rect.width;
        onSeek(Math.min(Math.max(p, 0), 1));
      }}
    >
      {bars.map((val, i) => {
        const barProgress = i / bars.length;
        const isPlayed = barProgress < progress;
        return (
          <div 
            key={i}
            className={`flex-1 rounded-sm transition-colors ${isPlayed ? activeColor : (interactive ? `${color} group-hover:bg-gray-600` : color)}`}
            style={{ height: `${Math.max(val * 100, 15)}%` }}
          />
        );
      })}
    </div>
  );
}
