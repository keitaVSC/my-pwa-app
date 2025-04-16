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
  // データベース初期化（最適化版）
  async initDB(): Promise<IDBDatabase> {
    // 既に初期化済みの場合は既存のプロミスを返す
    if (dbPromise) {
      try {
        // 既存のプロミスが有効かテスト
        const db = await dbPromise;
        // 有効性確認のための簡易操作
        const transaction = db.transaction([STORES.SETTINGS], 'readonly');
        transaction.objectStore(STORES.SETTINGS);
        return db;
      } catch (e) {
        // 無効なプロミスの場合はリセット
        dbPromise = null;
        logInfo('既存のDB接続が無効なためリセットします');
      }
    }
    
    // 新しいプロミスを作成
    dbPromise = new Promise((resolve, reject) => {
      try {
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
            logInfo('IndexedDB接続がクローズされました');
          };
          
          // エラーハンドリング
          db.onerror = (event) => {
            logError('IndexedDBエラー:', event);
          };
          
          // 接続テスト
          try {
            const testTransaction = db.transaction([STORES.SETTINGS], 'readonly');
            testTransaction.objectStore(STORES.SETTINGS);
          } catch (e) {
            logError('IndexedDB接続テストに失敗:', e);
            dbPromise = null;
            reject(new Error('IndexedDB接続テストに失敗しました'));
            return;
          }
          
          resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          // 出勤データストア
          if (!db.objectStoreNames.contains(STORES.ATTENDANCE)) {
            const attendanceStore = db.createObjectStore(STORES.ATTENDANCE, { keyPath: 'id' });
            attendanceStore.createIndex('employeeId', 'employeeId', { unique: false });
            attendanceStore.createIndex('date', 'date', { unique: false });
            // 複合インデックスを追加して検索を最適化
            attendanceStore.createIndex('employeeDate', ['employeeId', 'date'], { unique: true });
            logInfo('出勤データストアを作成しました');
          }
          
          // スケジュールデータストア
          if (!db.objectStoreNames.contains(STORES.SCHEDULE)) {
            const scheduleStore = db.createObjectStore(STORES.SCHEDULE, { keyPath: 'id' });
            scheduleStore.createIndex('date', 'date', { unique: false });
            // 日付+従業員IDのインデックスを追加
            scheduleStore.createIndex('dateEmployee', ['date', 'employeeId'], { unique: false });
            logInfo('スケジュールストアを作成しました');
          }
          
          // 設定ストア
          if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
            db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
            logInfo('設定ストアを作成しました');
          }
        };
      } catch (e) {
        logError('IndexedDB初期化中に予期せぬエラー:', e);
        dbPromise = null;
        reject(new Error('IndexedDB初期化中に予期せぬエラーが発生しました'));
      }
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

  // 勤怠データ保存（トランザクション安定性の改善版）- 修正済み
  async saveAttendanceData(data: AttendanceRecord[]): Promise<boolean> {
    if (!data || data.length === 0) return true;
    
    try {
      const db = await this.initDB();
      const CHUNK_SIZE = 50; // 小さくして安定性向上
      let success = true;
      let addedCount = 0;
      
      // 保存前に重複データをチェック - IDをキーにしたMapを作成
      const uniqueRecords = new Map<string, AttendanceRecord>();
      
      data.forEach(record => {
        if (record.employeeId && record.date) {
          const recordId = `${record.employeeId}_${record.date}`;
          uniqueRecords.set(recordId, record);
        }
      });
      
      // 一意のレコードの配列に変換
      const deduplicatedData = Array.from(uniqueRecords.values());
      logInfo(`重複排除後のレコード: ${deduplicatedData.length}件 (元: ${data.length}件)`);
      
      // 既存データをクリア（一括上書き）- データの一貫性を確保するため
      // 月単位の操作を想定しているため、月単位のデータをまとめて更新
      if (deduplicatedData.length > 0) {
        try {
          const monthPrefix = deduplicatedData[0].date.substring(0, 7); // YYYY-MM
          
          const monthRecords = deduplicatedData.filter(
            record => record.date.startsWith(monthPrefix)
          );
          
          // 月のデータが多い場合は、既存データをクリアする前に確認
          if (monthRecords.length > 100) {
            // 当月のデータだけをクリア
            await this.clearAttendanceDataByMonth(monthPrefix);
            logInfo(`${monthPrefix}の勤怠データをクリアしました`);
          }
        } catch (e) {
          logError('月次データクリアエラー:', e);
          // エラーでも処理継続
        }
      }
      
      // 各チャンクごとに独立したトランザクションを使用
      for (let i = 0; i < deduplicatedData.length; i += CHUNK_SIZE) {
        const chunk = deduplicatedData.slice(i, Math.min(i + CHUNK_SIZE, deduplicatedData.length));
        
        // リトライロジックを追加（最大3回）
        let retries = 0;
        let chunkSuccess = false;
        
        while (!chunkSuccess && retries < 3) {
          // 各チャンクで新しいトランザクションを作成
          chunkSuccess = await new Promise<boolean>(resolve => {
            try {
              const transaction = db.transaction([STORES.ATTENDANCE], 'readwrite');
              const store = transaction.objectStore(STORES.ATTENDANCE);
              
              transaction.oncomplete = () => {
                resolve(true);
              };
              
              transaction.onerror = (e) => {
                logError(`チャンク保存エラー (リトライ ${retries}/3):`, e);
                resolve(false);
              };
              
              let chunkAddedCount = 0;
              
              // 同一トランザクション内ですべての操作を完了
              chunk.forEach(record => {
                try {
                  const recordWithId = {
                    ...record,
                    id: record.employeeId && record.date 
                      ? `${record.employeeId}_${record.date}`
                      : `attendance_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
                  };
                  
                  const putRequest = store.put(recordWithId);
                  putRequest.onsuccess = () => {
                    chunkAddedCount++;
                    addedCount++;
                  };
                  putRequest.onerror = (e) => {
                    logError('レコード保存エラー:', e);
                  };
                } catch (e) {
                  logError('putリクエスト作成エラー:', e);
                }
              });
              
              // 進捗状況のログ
              if (isDev && i + CHUNK_SIZE < deduplicatedData.length) {
                logInfo(`チャンク処理中: ${Math.min(i + CHUNK_SIZE, deduplicatedData.length)}/${deduplicatedData.length}`);
              }
              
            } catch (txError) {
              logError(`トランザクション作成エラー (リトライ ${retries}/3):`, txError);
              resolve(false);
            }
          });
          
          if (!chunkSuccess) {
            retries++;
            if (retries < 3) {
              // 少し待機してからリトライ
              await new Promise(resolve => setTimeout(resolve, 300 * retries));
            }
          }
        }
        
        // チャンクの保存に失敗した場合は全体の成功フラグを更新
        if (!chunkSuccess) {
          success = false;
        }
        
        // チャンク間でメインスレッドを解放
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      logInfo(`IndexedDB: ${addedCount}件の勤怠データを保存しました`);
      return success;
    } catch (error) {
      logError('IndexedDB保存処理エラー:', error);
      return false;
    }
  },
  
  // 特定の月の勤怠データをクリア（新規追加）
  async clearAttendanceDataByMonth(monthPrefix: string): Promise<boolean> {
    try {
      const db = await this.initDB();
      
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction([STORES.ATTENDANCE], 'readwrite');
          const store = transaction.objectStore(STORES.ATTENDANCE);
          const index = store.index('date');
          
          // 該当月のレコードを取得してから削除（一括削除機能がないため）
          const range = IDBKeyRange.bound(
            `${monthPrefix}-01`,
            `${monthPrefix}-31`,
            false,
            false
          );
          
          const request = index.openCursor(range);
          let deletedCount = 0;
          
          request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
              try {
                const deleteRequest = cursor.delete();
                deleteRequest.onsuccess = () => deletedCount++;
              } catch (e) {
                logError('レコード削除エラー:', e);
              }
              cursor.continue();
            }
          };
          
          transaction.oncomplete = () => {
            logInfo(`${monthPrefix}の勤怠データ ${deletedCount}件を削除しました`);
            resolve(true);
          };
          
          transaction.onerror = (e) => {
            logError('月次データ削除エラー:', e);
            resolve(false);
          };
          
        } catch (txError) {
          logError('トランザクション作成エラー:', txError);
          resolve(false);
        }
      });
    } catch (error) {
      logError('クリア処理エラー:', error);
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
            logError('勤怠データ取得エラー:', event);
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
  
  // スケジュールデータ保存（最適化版）- 修正済み
  async saveScheduleData(data: ScheduleItem[]): Promise<boolean> {
    if (!data || data.length === 0) return true;
    
    try {
      const db = await this.initDB();
      
      // 重複を排除
      const uniqueItems = new Map<string, ScheduleItem>();
      data.forEach(item => {
        uniqueItems.set(item.id, item);
      });
      
      const deduplicatedData = Array.from(uniqueItems.values());
      logInfo(`重複排除後のスケジュール: ${deduplicatedData.length}件 (元: ${data.length}件)`);
      
      // 大量データの一括保存を避け、チャンク処理に変更
      const CHUNK_SIZE = 50; // 安定性向上のため小さいサイズに
      let success = true;
      let addedCount = 0;
      
      // チャンク処理でトランザクションを分散
      for (let i = 0; i < deduplicatedData.length; i += CHUNK_SIZE) {
        const chunk = deduplicatedData.slice(i, Math.min(i + CHUNK_SIZE, deduplicatedData.length));
        
        // リトライロジック
        let retries = 0;
        let chunkSuccess = false;
        
        while (!chunkSuccess && retries < 3) {
          chunkSuccess = await new Promise<boolean>(resolve => {
            try {
              const transaction = db.transaction([STORES.SCHEDULE], 'readwrite');
              const store = transaction.objectStore(STORES.SCHEDULE);
              
              transaction.oncomplete = () => {
                resolve(true);
              };
              
              transaction.onerror = (e) => {
                logError(`スケジュール保存エラー (リトライ ${retries}/3):`, e);
                resolve(false);
              };
              
              let chunkAddedCount = 0;
              
              // チャンク内のアイテムを処理
              chunk.forEach(item => {
                try {
                  const putRequest = store.put(item);
                  putRequest.onsuccess = () => {
                    chunkAddedCount++;
                    addedCount++;
                  };
                  putRequest.onerror = (e) => {
                    logError('スケジュールアイテム保存エラー:', e);
                  };
                } catch (e) {
                  logError('スケジュールput作成エラー:', e);
                }
              });
              
              // 進捗状況のログ
              if (isDev && i + CHUNK_SIZE < deduplicatedData.length) {
                logInfo(`スケジュール処理中: ${Math.min(i + CHUNK_SIZE, deduplicatedData.length)}/${deduplicatedData.length}`);
              }
              
            } catch (txError) {
              logError(`スケジュールトランザクション作成エラー (リトライ ${retries}/3):`, txError);
              resolve(false);
            }
          });
          
          if (!chunkSuccess) {
            retries++;
            if (retries < 3) {
              // 少し待機してからリトライ
              await new Promise(resolve => setTimeout(resolve, 300 * retries));
            }
          }
        }
        
        // チャンクの保存に失敗した場合は全体の成功フラグを更新
        if (!chunkSuccess) {
          success = false;
        }
        
        // チャンク間でメインスレッドを解放
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      logInfo(`IndexedDB: ${addedCount}件のスケジュールデータを保存しました`);
      return success;
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
          
          request.onerror = (e) => {
            logError('スケジュールデータ取得エラー:', e);
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
        putRequest.onerror = (e) => {
          logError(`設定保存エラー (${key}):`, e);
          resolve(false);
        };
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
        
        request.onerror = (e) => {
          logError(`設定取得エラー (${key}):`, e);
          resolve(defaultValue);
        };
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
          logInfo(`${storeName}ストアを正常にクリアしました`);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = (e) => {
            logError(`${storeName}クリアトランザクションエラー:`, e);
            resolve(false);
          };
        };
        
        request.onerror = (e) => {
          logError(`${storeName}クリアリクエストエラー:`, e);
          resolve(false);
        };
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