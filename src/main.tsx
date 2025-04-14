// main.tsx の完全修正版
import React from 'react'
import ReactDOM from 'react-dom/client'
import 'tailwindcss/tailwind.css'  // 直接Tailwindをインポート
import './index.css'  // カスタムスタイルもインポート
import App from './App.tsx'

// エラーハンドリングを追加
const renderApp = () => {
  try {
    const root = document.getElementById('root');
    
    if (!root) {
      console.error('Root element not found');
      return;
    }
    
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    console.error('Failed to render the app:', error);
    
    // フォールバックUI表示
    const errorDiv = document.createElement('div');
    errorDiv.style.padding = '20px';
    errorDiv.style.margin = '20px';
    errorDiv.style.backgroundColor = '#f8d7da';
    errorDiv.style.color = '#721c24';
    errorDiv.style.borderRadius = '5px';
    errorDiv.innerHTML = `
      <h2>アプリケーションの読み込みに失敗しました</h2>
      <p>お手数ですが、ページをリロードするか、しばらく経ってからお試しください。</p>
    `;
    
    const root = document.getElementById('root');
    if (root) {
      root.appendChild(errorDiv);
    }
  }
};

renderApp();