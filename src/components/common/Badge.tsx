import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
}

export default function Badge({
  children,
  variant = 'primary',
  size = 'md',
}: BadgeProps) {
  const variantStyles = {
    primary: 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300',
    secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    danger: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${variantStyles[variant]} ${sizeStyles[size]}`}
    >
      {children}
    </span>
  );
}
