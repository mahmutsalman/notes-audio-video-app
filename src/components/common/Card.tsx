import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export default function Card({
  children,
  className = '',
  onClick,
  hoverable = false,
}: CardProps) {
  const baseStyles = 'bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-sm';
  const hoverStyles = hoverable || onClick ? 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer' : '';

  return (
    <div
      className={`${baseStyles} ${hoverStyles} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
