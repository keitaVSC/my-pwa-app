// src/components/SyncButton.tsx
import React, { useCallback, memo } from 'react';

interface SyncButtonProps {
  onClick: () => void;
  isVisible: boolean;
}

// SVGアイコンをメモ化して再レンダリングを防止
const SyncIcon = memo(() => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 2v6h-6"></path>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
    <path d="M3 22v-6h6"></path>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
  </svg>
));
SyncIcon.displayName = 'SyncIcon';

// ローカルストレージ操作を安全に行う関数
const safelyStorePosition = (position: { x: number, y: number, time: number }) => {
  // メインスレッドをブロックしないために非同期実行
  requestAnimationFrame(() => {
    try {
      localStorage.setItem('_sync_button_click_pos', JSON.stringify(position));
    } catch (e) {
      console.error('Failed to save sync button click position', e);
    }
  });
};

const SyncButton: React.FC<SyncButtonProps> = memo(({ onClick, isVisible }) => {
  // クリックハンドラをメモ化して最適化
  const handleClick = useCallback((e: React.MouseEvent) => {
    // スクロール位置を非同期で保存
    safelyStorePosition({
      x: window.scrollX || 0,
      y: window.scrollY || 0,
      time: Date.now()
    });
    
    // バブリングは必要な場合のみ停止
    if (e.target !== e.currentTarget) {
      e.stopPropagation();
    }
    
    // ボタンクリックの処理を非同期実行（UI応答性向上）
    requestAnimationFrame(() => {
      onClick();
    });
  }, [onClick]);

  if (!isVisible) return null;

  return (
    <div className="sync-button-container">
      <button
        onClick={handleClick}
        className="sync-button"
        aria-label="データを同期"
        style={{
          willChange: 'transform', // GPU加速のヒント
          transform: 'translateZ(0)'
        }}
      >
        <SyncIcon />
        <span>データを同期</span>
      </button>
    </div>
  );
});

SyncButton.displayName = 'SyncButton';
export default SyncButton;