// src/components/OfflineIndicator.tsx
import React, { useEffect, useState, useCallback, memo, useMemo } from 'react';

interface OfflineIndicatorProps {
  isOffline: boolean;
  pendingChanges: boolean;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = memo(({ isOffline, pendingChanges }) => {
  const [showNotification, setShowNotification] = useState<boolean>(false);
  const [hideTimeoutId, setHideTimeoutId] = useState<number | null>(null);
  
  // メッセージをメモ化して不要な再計算を防止
  const message = useMemo(() => {
    return `オフラインモード${pendingChanges ? "（未同期のデータがあります）" : ""}`;
  }, [pendingChanges]);
  
  // 状態変化検知と表示タイマー制御を最適化
  useEffect(() => {
    // 前回のタイマーをクリア
    if (hideTimeoutId !== null) {
      clearTimeout(hideTimeoutId);
      setHideTimeoutId(null);
    }
    
    if (isOffline) {
      // オフライン状態になったら即時表示
      setShowNotification(true);
      
      // 10秒後に自動的に閉じるタイマー
      const timerId = window.setTimeout(() => {
        if (isOffline) {
          setShowNotification(false);
        }
        setHideTimeoutId(null);
      }, 10000);
      
      setHideTimeoutId(timerId as unknown as number);
    } else {
      // オンラインに戻ったら即時非表示
      setShowNotification(false);
    }
    
    // クリーンアップ時にタイマーを削除
    return () => {
      if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
      }
    };
  }, [isOffline]);
  
  // 未同期データ状態の変化に対応
  useEffect(() => {
    if (isOffline && pendingChanges) {
      setShowNotification(true);
      
      // 既存タイマーをリセット
      if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
        
        // 新しいタイマーを設定
        const timerId = window.setTimeout(() => {
          setShowNotification(false);
          setHideTimeoutId(null);
        }, 10000);
        
        setHideTimeoutId(timerId as unknown as number);
      }
    }
  }, [pendingChanges, isOffline, hideTimeoutId]);
  
  // 閉じるボタンハンドラをメモ化
  const handleClose = useCallback(() => {
    setShowNotification(false);
    
    if (hideTimeoutId !== null) {
      clearTimeout(hideTimeoutId);
      setHideTimeoutId(null);
    }
  }, [hideTimeoutId]);
  
  // SVG要素をメモ化
  const OfflineIcon = useMemo(() => (
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
      <line x1="1" y1="1" x2="23" y2="23"></line>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
      <line x1="12" y1="20" x2="12.01" y2="20"></line>
    </svg>
  ), []);
  
  if (!isOffline || !showNotification) return null;

  return (
    <div 
      className="offline-indicator" 
      style={{ 
        zIndex: 1900,
        willChange: 'transform, opacity',
        transform: 'translateZ(0)'
      }}
      role="alert"
      aria-live="polite"
    >
      {OfflineIcon}
      {message}
      <button 
        onClick={handleClose}
        className="ml-2 p-1 text-xs rounded-full bg-white/20 hover:bg-white/30"
        title="通知を閉じる"
        aria-label="通知を閉じる"
      >×</button>
    </div>
  );
});

OfflineIndicator.displayName = 'OfflineIndicator';
export default OfflineIndicator;