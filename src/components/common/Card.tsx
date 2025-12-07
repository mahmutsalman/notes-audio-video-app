import { ReactNode, CSSProperties } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  hoverable?: boolean;
}

export default function Card({
  children,
  className = '',
  style,
  onClick,
  onContextMenu,
  hoverable = false,
}: CardProps) {
  const baseStyles = 'bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-sm';
  const hoverStyles = hoverable || onClick ? 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer' : '';

  return (
    <div
      className={`${baseStyles} ${hoverStyles} ${className}`}
      style={style}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
}
