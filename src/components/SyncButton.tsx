// src/components/SyncButton.tsx
import React from 'react';

interface SyncButtonProps {
  onClick: () => void;
  isVisible: boolean;
}

const SyncButton: React.FC<SyncButtonProps> = ({ onClick, isVisible }) => {
  if (!isVisible) return null;

  const handleClick = (e: React.MouseEvent) => {
    // イベントのバブリングを止める
    e.stopPropagation();
    // クリック時のスクロール位置を保存
    try {
      const scrollPosition = {
        x: window.scrollX,
        y: window.scrollY,
        time: Date.now()
      };
      localStorage.setItem('_sync_button_click_pos', JSON.stringify(scrollPosition));
    } catch (e) {
      console.error('Failed to save sync button click position', e);
    }
    // ボタンクリックの処理を実行
    onClick();
  };

  return (
    <div className="sync-button-container">
      <button
        onClick={handleClick}
        className="sync-button"
        aria-label="データを同期"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2v6h-6"></path>
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
          <path d="M3 22v-6h6"></path>
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
        </svg>
        <span>データを同期</span>
      </button>
    </div>
  );
};

export default SyncButton;