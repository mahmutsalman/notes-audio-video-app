import { formatImportance } from '../../utils/formatters';

interface ImportanceSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  showStars?: boolean;
}

export default function ImportanceSlider({
  value,
  onChange,
  disabled = false,
  showStars = true,
}: ImportanceSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {showStars && (
          <span className="text-yellow-500 dark:text-yellow-400 tracking-wider">
            {formatImportance(value)}
          </span>
        )}
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {value}/10
        </span>
      </div>
      <input
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full h-2 bg-gray-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer
                   disabled:cursor-not-allowed disabled:opacity-50
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:h-4
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-primary-600
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:hover:bg-primary-700"
      />
    </div>
  );
}
