/**
 * Format duration in seconds to mm:ss or hh:mm:ss
 */
export function formatDuration(seconds: number | null | undefined): string {
  // Handle null, undefined, NaN, Infinity, and negative values
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format date to relative time (e.g., "2 hours ago", "Yesterday")
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

/**
 * Format date to full date string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Strip HTML tags from string, returning plain text
 */
export function stripHtmlTags(html: string | null | undefined): string {
  if (!html) return '';
  // Remove HTML tags and decode common entities
  return html
    .replace(/<[^>]*>/g, '')    // Remove all HTML tags
    .replace(/&nbsp;/g, ' ')    // Replace non-breaking spaces
    .replace(/&amp;/g, '&')     // Decode ampersand
    .replace(/&lt;/g, '<')      // Decode less than
    .replace(/&gt;/g, '>')      // Decode greater than
    .replace(/&quot;/g, '"')    // Decode quotes
    .replace(/&#39;/g, "'")     // Decode apostrophe
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .trim();
}

/**
 * Truncate text to first 1-2 sentences or max characters
 * Handles HTML content by stripping tags first
 */
export function truncateNotes(text: string | null | undefined, maxLength = 150): string {
  if (!text) return '';

  // Strip HTML tags first (for Quill.js rich text content)
  const plainText = stripHtmlTags(text);

  if (!plainText) return '';

  // If text is short enough, return as is
  if (plainText.length <= maxLength) return plainText;

  // Try to find sentence boundary within maxLength
  const truncated = plainText.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclaim = truncated.lastIndexOf('!');
  const boundary = Math.max(lastPeriod, lastQuestion, lastExclaim);

  // If we found a sentence boundary and it's not too early
  if (boundary > maxLength * 0.4) {
    return plainText.slice(0, boundary + 1);
  }

  // Otherwise, truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    return plainText.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Format file size to human readable
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generate importance stars display
 */
export function formatImportance(level: number): string {
  const filled = level;
  const empty = 10 - level;
  return '★'.repeat(filled) + '☆'.repeat(empty);
}

/**
 * Format current timestamp for use as a default recording name
 * Example: "Dec 10, 8:45 PM"
 */
export function formatTimestampName(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
