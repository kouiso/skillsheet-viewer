import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ToastProps {
  open: boolean;
  message: string;
  variant?: 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

export const Toast = ({ open, message, variant = 'success', onClose, duration = 4000 }: ToastProps) => {
  useEffect(() => {
    if (open && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [open, duration, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg',
              variant === 'success' && 'bg-green-600 text-white',
              variant === 'error' && 'bg-destructive text-destructive-foreground',
            )}
          >
            {variant === 'success' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span className="text-sm font-medium">{message}</span>
            <button
              onClick={onClose}
              className="ml-2 rounded-full p-1 hover:bg-white/20 transition-colors"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
