interface HighlightedTextProps {
  text: string;
  positions?: number[];
  className?: string;
}

/**
 * Component that highlights specific character positions in text
 * Used for showing search matches
 */
export function HighlightedText({
  text,
  positions = [],
  className = '',
}: HighlightedTextProps) {
  // If no positions or empty text, just render plain text
  if (!text || positions.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // Create a set for O(1) lookup
  const positionSet = new Set(positions.filter(pos => pos >= 0 && pos < text.length));

  // If no valid positions, render plain text
  if (positionSet.size === 0) {
    return <span className={className}>{text}</span>;
  }

  // Build array of text segments with highlight information
  const segments: Array<{ text: string; highlighted: boolean }> = [];
  let currentSegment = { text: '', highlighted: false };

  for (let i = 0; i < text.length; i++) {
    const shouldHighlight = positionSet.has(i);

    // Start new segment if highlight state changes
    if (shouldHighlight !== currentSegment.highlighted) {
      if (currentSegment.text) {
        segments.push(currentSegment);
      }
      currentSegment = { text: text[i], highlighted: shouldHighlight };
    } else {
      currentSegment.text += text[i];
    }
  }

  // Add final segment
  if (currentSegment.text) {
    segments.push(currentSegment);
  }

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={index}
            className="bg-yellow-200 dark:bg-yellow-800 text-gray-900 dark:text-gray-100 rounded px-0.5"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  );
}
