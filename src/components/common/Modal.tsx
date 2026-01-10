import { ReactNode, useEffect, useState, useRef } from 'react';

interface Position {
  x: number | 'center';
  y: number | 'center';
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  draggable?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  draggable = false,
}: ModalProps) {
  const [position, setPosition] = useState<Position>({ x: 'center', y: 'center' });
  const modalRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    modalStartX: 0,
    modalStartY: 0,
  });
  const rafRef = useRef<number | null>(null);

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 'center', y: 'center' });
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Handle drag events with requestAnimationFrame for smooth updates
  useEffect(() => {
    if (!draggable || !isOpen) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.current.isDragging) return;

      // Cancel any pending animation frame
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      // Use requestAnimationFrame for smooth updates
      rafRef.current = requestAnimationFrame(() => {
        const deltaX = e.clientX - dragState.current.startX;
        const deltaY = e.clientY - dragState.current.startY;

        let newX = dragState.current.modalStartX + deltaX;
        let newY = dragState.current.modalStartY + deltaY;

        // Apply boundary constraints
        if (modalRef.current) {
          const modalRect = modalRef.current.getBoundingClientRect();
          const minVisiblePx = 50; // Keep at least 50px of header visible

          // Constrain horizontal position
          newX = Math.max(
            minVisiblePx - modalRect.width,
            Math.min(window.innerWidth - minVisiblePx, newX)
          );

          // Constrain vertical position
          newY = Math.max(
            0,
            Math.min(window.innerHeight - minVisiblePx, newY)
          );
        }

        setPosition({ x: newX, y: newY });
      });
    };

    const handleMouseUp = () => {
      dragState.current.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Cancel any pending animation frame
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      // Cleanup animation frame on unmount
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [draggable, isOpen]);

  // Handle mouse down on header to start dragging
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (!draggable) return;

    // Get current modal position
    if (modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      let currentX: number;
      let currentY: number;

      if (position.x === 'center' || position.y === 'center') {
        // If centered, use current screen position
        currentX = rect.left;
        currentY = rect.top;
      } else {
        currentX = position.x;
        currentY = position.y;
      }

      dragState.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        modalStartX: currentX,
        modalStartY: currentY,
      };

      document.body.style.cursor = 'move';
      document.body.style.userSelect = 'none';
    }
  };

  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  // Calculate modal style based on position
  const modalContainerStyle: React.CSSProperties =
    draggable && position.x !== 'center' && position.y !== 'center'
      ? {
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          margin: 0,
          pointerEvents: 'auto',
        }
      : draggable
      ? { pointerEvents: 'auto' }
      : {};

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={draggable ? { pointerEvents: 'none' } : {}}>
      {/* Backdrop - non-blocking when draggable */}
      <div
        className={`fixed inset-0 transition-opacity ${draggable ? 'bg-black/20' : 'bg-black/50'}`}
        onClick={draggable ? undefined : onClose}
        style={draggable ? { pointerEvents: 'none' } : {}}
      />

      {/* Modal Container */}
      <div
        className={draggable && position.x !== 'center' ? '' : 'flex min-h-full items-center justify-center p-4'}
      >
        <div
          ref={modalRef}
          style={modalContainerStyle}
          className={`relative bg-white dark:bg-dark-surface rounded-xl shadow-xl w-full ${sizeStyles[size]} transform transition-all ${
            draggable && position.x === 'center' ? 'mx-4' : ''
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {title && (
            <div
              className={`flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border ${
                draggable ? 'cursor-move select-none' : ''
              }`}
              onMouseDown={handleHeaderMouseDown}
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h2>
              <button
                onClick={onClose}
                onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking close button
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
              >
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Content */}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
