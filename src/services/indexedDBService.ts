// src/services/indexedDBService.ts
import { AttendanceRecord } from '../types';

// ScheduleItemの型定義
interface ScheduleItem {
  id: string;
  employeeId: string;  // 後方互換性のために維持
  employeeIds?: string[]; // 複数従業員対応
  date: string;
  title: string;
  details?: string;
  color?: string;
}

const DB_NAME = 'AttendanceAppDB';
const DB_VERSION = 1;
const STORES = {
  ATTENDANCE: 'attendance',
  SCHEDULE: 'schedule',
  SETTINGS: 'settings'
};

// 開発環境かどうかの判定
const isDev = process.env.NODE_ENV === 'development';

// ロギング関数 - 開発環境のみログを出力する
const logInfo = (message: string, ...args: any[]) => {
  if (isDev) console.log(message, ...args);
};

const logError = (message: string, ...args: any[]) => {
  console.error(message, ...args);
};

// DBコネクション管理（パフォーマンス向上のためコネクションを再利用）
let dbPromise: Promise<IDBDatabase> | null = null;

// UIスレッドに制御を戻す関数
const yieldToUI = async (): Promise<void> => {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
};

export const IndexedDBService = {
  // データベース初期化（最適化バージョン）
  async initDB(): Promise<IDBDatabase> {
    // 既に初期化済みの場合は既存のプロミスを返す
    if (dbPromise) {
      return dbPromise;
    }
    
    // 新しいプロミスを作成
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        logError('IndexedDB初期化エラー:', event);
        dbPromise = null; // エラー時はプロミスをリセット
        reject(new Error('IndexedDBを開けませんでした'));
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 接続が切れた場合の処理
        db.onclose = () => {
          dbPromise = null; // 接続が閉じられたらプロミスをリセット
        };
        
        // エラーハンドリング
        db.onerror = (event) => {
          logError('IndexedDBエラー:', event);
        };
        
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 出勤データストア
        if (!db.objectStoreNames.contains(STORES.ATTENDANCE)) {
          const attendanceStore = db.createObjectStore(STORES.ATTENDANCE, { keyPath: 'id' });
          attendanceStore.createIndex('employeeId', 'employeeId', { unique: false });
          attendanceStore.createIndex('date', 'date', { unique: false });
          logInfo('出勤データストアを作成しました');
        }
        
        // スケジュールデータストア
        if (!db.objectStoreNames.contains(STORES.SCHEDULE)) {
          const scheduleStore = db.createObjectStore(STORES.SCHEDULE, { keyPath: 'id' });
          scheduleStore.createIndex('date', 'date', { unique: false });
          logInfo('スケジュールストアを作成しました');
        }
        
        // 設定ストア
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
          logInfo('設定ストアを作成しました');
        }
      };
    });
    
    return dbPromise;
  },
  
  // チャンク処理用ユーティリティ関数
  async processInChunks<T>(items: T[], chunkSize: number, processor: (chunk: T[]) => Promise<void>): Promise<void> {
    const chunks = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    
    for (let i = 0; i < chunks.length; i++) {
      await processor(chunks[i]);
      
      // チャンク間でメインスレッドを解放する（UIブロッキングを防止）
      if (i < chunks.length - 1) {
        await yieldToUI();
      }
    }
  },
  
  // 勤怠データ保存（効率化版 - パフォーマンス最適化）
  async saveAttendanceData(data: AttendanceRecord[]): Promise<boolean> {
    if (!data || data.length === 0) return true;
    
    try {
      const db = await this.initDB();
      
      // メインスレッドをブロックしないようにするための最適化
      return new Promise(async (outerResolve) => {
        try {
          // 大量データを扱う場合はクリアせずに差分更新を行う最適化
          const CHUNK_SIZE = 250; // より大きなチャンクサイズ
          let addedCount = 0;
          
          // トランザクションを一度だけ作成（複数トランザクションの作成を避ける）
          const transaction = db.transaction([STORES.ATTENDANCE], 'readwrite');
          const store = transaction.objectStore(STORES.ATTENDANCE);
          
          // トランザクションコールバック
          transaction.oncomplete = () => {
            logInfo(`IndexedDB: ${addedCount}件の勤怠データを保存しました`);
            outerResolve(true);
          };
          
          transaction.onerror = (event) => {
            logError('IndexedDB勤怠データ保存トランザクションエラー:', event);
            outerResolve(addedCount > 0); // 一部でも保存できていればtrueを返す
          };
          
          // 既存データを削除するかを判断
          // 既存データとの差分が大きい場合のみクリア
          if (data.length > 1000) {
            try {
              await new Promise<void>((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => resolve();
                clearRequest.onerror = (e) => {
                  logError('store.clear() エラー:', e);
                  resolve(); // エラーでも継続
                };
              });
            } catch (e) {
              logError('クリア操作エラー:', e);
              // エラーでも処理継続
            }
          }
          
          // データをチャンクに分割して処理
          await this.processInChunks(data, CHUNK_SIZE, async (chunk) => {
            // 各チャンク内のレコードを並列処理
            const promises = chunk.map(record => {
              return new Promise<void>(resolve => {
                try {
                  const recordWithId = {
                    ...record,
                    id: record.employeeId && record.date 
                      ? `${record.employeeId}_${record.date}`
                      : `attendance_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
                  };
                  
                  const putRequest = store.put(recordWithId);
                  putRequest.onsuccess = () => {
                    addedCount++;
                    resolve();
                  };
                  putRequest.onerror = (e) => {
                    logError('データ保存エラー:', e);
                    resolve(); // エラーでも処理続行
                  };
                } catch (e) {
                  logError('putリクエスト作成エラー:', e);
                  resolve(); // エラーでも処理続行
                }
              });
            });
            
            await Promise.all(promises);
          });
        } catch (innerError) {
          logError('IndexedDB chunked save error:', innerError);
          outerResolve(false);
        }
      });
    } catch (error) {
      logError('IndexedDB初期化エラー:', error);
      return false;
    }
  },
  
  // 勤怠データ取得（最適化版）
  async getAttendanceData(): Promise<AttendanceRecord[]> {
    try {
      const db = await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction([STORES.ATTENDANCE], 'readonly');
          const store = transaction.objectStore(STORES.ATTENDANCE);
          
          const request = store.getAll();
          
          request.onsuccess = () => {
            // メインスレッドをブロックしないように最適化
            setTimeout(() => {
              const records = request.result.map(record => {
                const { id, ...recordWithoutId } = record;
                return recordWithoutId as AttendanceRecord;
              });
              
              logInfo(`${records.length}件の勤怠データを読み込みました`);
              resolve(records);
            }, 0);
          };
          
          request.onerror = (event) => {
            reject(new Error('勤怠データ取得に失敗しました'));
          };
        } catch (txError) {
          logError('トランザクション作成エラー:', txError);
          reject(txError);
        }
      });
    } catch (error) {
      logError('IndexedDB勤怠データ取得エラー:', error);
      return [];
    }
  },
  
  // スケジュールデータ保存（最適化版）
  async saveScheduleData(data: ScheduleItem[]): Promise<boolean> {
    if (!data || data.length === 0) return true;
    
    try {
      const db = await this.initDB();
      
      return new Promise(async (outerResolve) => {
        try {
          const CHUNK_SIZE = 200;
          let addedCount = 0;
          
          const transaction = db.transaction([STORES.SCHEDULE], 'readwrite');
          const store = transaction.objectStore(STORES.SCHEDULE);
          
          transaction.oncomplete = () => {
            logInfo(`${addedCount}件のスケジュールデータを保存しました`);
            outerResolve(true);
          };
          
          transaction.onerror = (event) => {
            logError('スケジュールデータ保存トランザクションエラー:', event);
            outerResolve(addedCount > 0);
          };
          
          // データ量に応じて既存データをクリアするかを判断
          if (data.length > 500) {
            try {
              await new Promise<void>((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => resolve();
                clearRequest.onerror = () => resolve(); // エラーでも継続
              });
            } catch (e) {
              // エラーでも処理継続
            }
          }
          
          // チャンク処理
          await this.processInChunks(data, CHUNK_SIZE, async (chunk) => {
            const promises = chunk.map(item => {
              return new Promise<void>(resolve => {
                try {
                  const putRequest = store.put(item);
                  putRequest.onsuccess = () => {
                    addedCount++;
                    resolve();
                  };
                  putRequest.onerror = () => resolve(); // エラー時も処理続行
                } catch (e) {
                  resolve(); // エラーでも処理続行
                }
              });
            });
            
            await Promise.all(promises);
          });
        } catch (innerError) {
          logError('IndexedDB chunked save error:', innerError);
          outerResolve(false);
        }
      });
    } catch (error) {
      logError('IndexedDBスケジュールデータ保存エラー:', error);
      return false;
    }
  },
  
  // スケジュールデータ取得（最適化版）
  async getScheduleData(): Promise<ScheduleItem[]> {
    try {
      const db = await this.initDB();
      
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction([STORES.SCHEDULE], 'readonly');
          const store = transaction.objectStore(STORES.SCHEDULE);
          
          const request = store.getAll();
          
          request.onsuccess = () => {
            // メインスレッドをブロックしないように最適化
            setTimeout(() => {
              logInfo(`${request.result.length}件のスケジュールデータを読み込みました`);
              resolve(request.result as ScheduleItem[]);
            }, 0);
          };
          
          request.onerror = () => {
            reject(new Error('スケジュールデータ取得に失敗しました'));
          };
        } catch (txError) {
          logError('トランザクション作成エラー:', txError);
          reject(txError);
        }
      });
    } catch (error) {
      logError('IndexedDBスケジュールデータ取得エラー:', error);
      return [];
    }
  },
  
  // 設定の保存
  async saveSetting<T>(key: string, value: T): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.SETTINGS], 'readwrite');
      const store = transaction.objectStore(STORES.SETTINGS);
      
      return new Promise(resolve => {
        const putRequest = store.put({ key, value });
        putRequest.onsuccess = () => resolve(true);
        putRequest.onerror = () => resolve(false);
      });
    } catch (error) {
      logError(`IndexedDB設定保存エラー (${key}):`, error);
      return false;
    }
  },
  
  // 設定の取得
  async getSetting<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.SETTINGS], 'readonly');
      const store = transaction.objectStore(STORES.SETTINGS);
      
      return new Promise(resolve => {
        const request = store.get(key);
        
        request.onsuccess = () => {
          if (request.result) {
            resolve(request.result.value);
          } else {
            resolve(defaultValue);
          }
        };
        
        request.onerror = () => resolve(defaultValue);
      });
    } catch (error) {
      logError(`IndexedDB設定取得エラー (${key}):`, error);
      return defaultValue;
    }
  },
  
  // ストアのクリア
  async clearStore(storeName: string): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      return new Promise(resolve => {
        const request = store.clear();
        
        request.onsuccess = () => {
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
        };
        
        request.onerror = () => resolve(false);
      });
    } catch (error) {
      logError(`IndexedDBストアクリアエラー (${storeName}):`, error);
      return false;
    }
  },
  
  // データベース全体のクリア
  async clearAll(): Promise<boolean> {
    try {
      let success = true;
      
      for (const store of Object.values(STORES)) {
        const result = await this.clearStore(store);
        if (!result) success = false;
        
        // UIスレッドに制御を戻す
        await yieldToUI();
      }
      
      logInfo('IndexedDBの全データをクリアしました');
      return success;
    } catch (error) {
      logError('IndexedDB全データクリアエラー:', error);
      return false;
    }
  },
  
  // ヘルスチェック
  async healthCheck(): Promise<boolean> {
    try {
      const testKey = '_health_check';
      const testValue = { timestamp: Date.now() };
      
      // 保存テスト
      const saveResult = await this.saveSetting(testKey, testValue);
      if (!saveResult) return false;
      
      // 読み込みテスト
      const retrievedValue = await this.getSetting(testKey);
      if (!retrievedValue || (retrievedValue as any).timestamp !== testValue.timestamp) {
        return false;
      }
      
      // クリーンアップ
      await this.clearStore(STORES.SETTINGS);
      
      return true;
    } catch (error) {
      logError('IndexedDBヘルスチェックエラー:', error);
      return false;
    }
  },
  
  // 接続リセット（トラブルシューティング用）
  resetConnection(): void {
    dbPromise = null;
    logInfo('IndexedDB接続をリセットしました');
  }
};