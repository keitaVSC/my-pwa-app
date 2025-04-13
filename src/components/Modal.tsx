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
  const scrollPositionRef = useRef<number>(0);
  const isClosingRef = useRef<boolean>(false);
  const previousIsOpenRef = useRef<boolean>(false);

  // モーダル表示時の処理
  useEffect(() => {
    if (!isOpen) {
      // モーダルが閉じられた場合
      if (previousIsOpenRef.current && !isClosingRef.current) {
        // スクロール位置の復元などの処理を行う
        document.body.classList.remove('modal-open');
        document.body.style.top = '';
        document.body.style.position = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollPositionRef.current);
      }
      previousIsOpenRef.current = false;
      return;
    }

    // モーダルが開かれた場合
    previousIsOpenRef.current = true;
    isClosingRef.current = false;

    // スクロール位置を保存
    scrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
    
    // スクロール防止
    document.body.classList.add('modal-open');
    document.body.style.top = `-${scrollPositionRef.current}px`;
    document.body.style.position = 'fixed';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100%';
    
    // キーボードイベント（ESCキー）
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        isClosingRef.current = true;
        onClose();
      }
    };
    
    // モーダル外クリック
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
        isClosingRef.current = true;
        onClose();
      }
    };
    
    // イベントリスナー登録
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleOutsideClick);
    
    // クリーンアップ関数
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen, onClose]);

  // モーダルが閉じられる時に実行するクリーンアップ
  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isClosingRef.current = true;
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div
        ref={modalRef}
        className="modal-body fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold">{title}</h2>
          {showCloseButton && (
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-full touch-fix"
              aria-label="Close modal"
              style={{ minHeight: '44px', minWidth: '44px' }}
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>
        <div className="p-4" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;