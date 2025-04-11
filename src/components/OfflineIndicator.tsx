// src/components/OfflineIndicator.tsx
import React, { useEffect, useState } from 'react';

interface OfflineIndicatorProps {
  isOffline: boolean;
  pendingChanges: boolean;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ isOffline, pendingChanges }) => {
  const [showNotification, setShowNotification] = useState<boolean>(false);
  
  // 状態変化を検知して通知表示を管理
  useEffect(() => {
    if (isOffline) {
      setShowNotification(true);
      // 10秒後に通知を自動的に閉じる（ただしオフライン状態が続く場合）
      const timer = setTimeout(() => {
        if (isOffline) {
          setShowNotification(false);
        }
      }, 10000);
      
      return () => clearTimeout(timer);
    } else {
      // オンラインに戻った場合は即時表示をオフ
      setShowNotification(false);
    }
  }, [isOffline]);
  
  // pendingChangesが変わった時も表示を更新
  useEffect(() => {
    if (isOffline && pendingChanges) {
      setShowNotification(true);
    }
  }, [pendingChanges, isOffline]);
  
  if (!isOffline || !showNotification) return null;

  return (
    <div className="offline-indicator" style={{ zIndex: 1900 }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <line x1="12" y1="20" x2="12.01" y2="20"></line>
      </svg>
      オフラインモード{pendingChanges ? "（未同期のデータがあります）" : ""}
      <button 
        onClick={() => setShowNotification(false)}
        className="ml-2 p-1 text-xs rounded-full bg-white/20 hover:bg-white/30"
        title="通知を閉じる"
      >×</button>
    </div>
  );
};

export default OfflineIndicator;