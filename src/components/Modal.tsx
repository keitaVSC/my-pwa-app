// src/components/Modal.tsx
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  showCloseButton = true 
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const bodyScrollPositionRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      // スクロール位置を保存（複数の方法で取得を試みる）
      bodyScrollPositionRef.current = {
        x: window.pageXOffset || window.scrollX || document.documentElement.scrollLeft,
        y: window.pageYOffset || window.scrollY || document.documentElement.scrollTop
      };
      
      // イベントリスナーを追加
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
      
      // スクロール防止 - よりモバイルフレンドリーな方法
      const scrollY = bodyScrollPositionRef.current.y;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    }

    return () => {
      // イベントリスナーを削除
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      
      if (isOpen) {
        // スクロール位置を復元
        const scrollY = bodyScrollPositionRef.current.y;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        
        // スクロール位置を複数の方法で復元を試みる
        window.scrollTo(0, scrollY);
        
        // 少し遅延させて再度スクロール位置を復元（より確実に）
        setTimeout(() => {
          window.scrollTo(0, scrollY);
        }, 50);
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 modal-overlay"
         style={{ touchAction: 'none' }}>
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto modal-body"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold">{title}</h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full"
              aria-label="Close modal"
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

export default Modal;