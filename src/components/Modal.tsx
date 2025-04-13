// src/components/Modal.tsx
import React, { useEffect, useRef, useCallback, memo } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}

const Modal: React.FC<ModalProps> = memo(({ 
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
  const eventListenersAttachedRef = useRef<boolean>(false);

  // キーボードイベント（ESCキー）ハンドラをメモ化
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      isClosingRef.current = true;
      onClose();
    }
  }, [onClose]);
  
  // モーダル外クリックハンドラをメモ化
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      e.preventDefault();
      e.stopPropagation();
      isClosingRef.current = true;
      onClose();
    }
  }, [onClose]);

  // イベントリスナー管理の最適化
  useEffect(() => {
    if (isOpen && !eventListenersAttachedRef.current) {
      // リスナーを一度だけ追加（重複追加防止）
      document.addEventListener('keydown', handleEscape, {passive: false});
      document.addEventListener('mousedown', handleOutsideClick, {passive: false});
      eventListenersAttachedRef.current = true;
    } else if (!isOpen && eventListenersAttachedRef.current) {
      // リスナーを一度だけ削除
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleOutsideClick);
      eventListenersAttachedRef.current = false;
    }
    
    return () => {
      if (eventListenersAttachedRef.current) {
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('mousedown', handleOutsideClick);
        eventListenersAttachedRef.current = false;
      }
    };
  }, [isOpen, handleEscape, handleOutsideClick]);

  // スクロール制御の最適化
  useEffect(() => {
    if (isOpen) {
      // モーダルが開かれた場合
      previousIsOpenRef.current = true;
      isClosingRef.current = false;

      // スクロール位置を保存
      scrollPositionRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      
      // DOM操作をバッチ化して強制リフローを削減
      requestAnimationFrame(() => {
        const bodyStyle = document.body.style;
        document.body.classList.add('modal-open');
        
        // スタイル適用をバッチで行い、リフローを最小化
        bodyStyle.top = `-${scrollPositionRef.current}px`;
        bodyStyle.position = 'fixed';
        bodyStyle.overflow = 'hidden';
        bodyStyle.width = '100%';
      });
    } 
    else if (previousIsOpenRef.current && !isClosingRef.current) {
      // モーダルが閉じられた場合
      requestAnimationFrame(() => {
        document.body.classList.remove('modal-open');
        
        // すべてのスタイルリセットをバッチ処理
        const bodyStyle = document.body.style;
        bodyStyle.top = '';
        bodyStyle.position = '';
        bodyStyle.overflow = '';
        bodyStyle.width = '';
        
        // スクロール位置を復元（スムーススクロールなし）
        window.scrollTo({
          top: scrollPositionRef.current,
          behavior: 'auto' // 即時スクロール
        });
      });
      
      previousIsOpenRef.current = false;
    }
  }, [isOpen]);

  // クローズボタンハンドラをメモ化
  const handleClose = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isClosingRef.current = true;
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={modalRef}
        className="modal-body"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          willChange: 'transform, opacity', // GPU加速のヒント
          transform: 'translateZ(0)'
        }}
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
});

Modal.displayName = 'Modal';
export default Modal;