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

export const IndexedDBService = {
  // データベース初期化
  async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        logError('IndexedDB初期化エラー:', event);
        reject(new Error('IndexedDBを開けませんでした'));
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
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
  },
  
  // 勤怠データ保存（改善版）
  async saveAttendanceData(data: AttendanceRecord[]): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.ATTENDANCE], 'readwrite');
      const store = transaction.objectStore(STORES.ATTENDANCE);
      
      // 既存データをクリア
      await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = (event) => reject(new Error('Failed to clear attendance store'));
      });
      
      // 最適化されたバッチ処理
      const BATCH_SIZE = 100; // バッチサイズを増加
      let addedCount = 0;
      
      // データをバッチに分割して処理
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(record => {
          return new Promise<void>(resolve => {
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
            putRequest.onerror = () => resolve(); // エラー時も処理続行
          });
        }));
      }
      
      return new Promise(resolve => {
        transaction.oncomplete = () => {
          logInfo(`${addedCount}件の勤怠データをIndexedDBに保存しました`);
          resolve(true);
        };
        transaction.onerror = () => {
          resolve(addedCount > 0); // 一部成功の場合もtrueを返す
        };
      });
    } catch (error) {
      logError('IndexedDB勤怠データ保存エラー:', error);
      return false;
    }
  },
  
  // 勤怠データ取得
  async getAttendanceData(): Promise<AttendanceRecord[]> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.ATTENDANCE], 'readonly');
      const store = transaction.objectStore(STORES.ATTENDANCE);
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          const records = request.result.map(record => {
            const { id, ...recordWithoutId } = record;
            return recordWithoutId as AttendanceRecord;
          });
          
          logInfo(`${records.length}件の勤怠データを読み込みました`);
          resolve(records);
        };
        
        request.onerror = () => {
          reject(new Error('勤怠データ取得に失敗しました'));
        };
      });
    } catch (error) {
      logError('IndexedDB勤怠データ取得エラー:', error);
      return [];
    }
  },
  
  // スケジュールデータ保存（改善版）
  async saveScheduleData(data: ScheduleItem[]): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.SCHEDULE], 'readwrite');
      const store = transaction.objectStore(STORES.SCHEDULE);
      
      // 既存データをクリア
      await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(new Error('Failed to clear schedule store'));
      });
      
      // 最適化されたバッチ処理
      const BATCH_SIZE = 100;
      let addedCount = 0;
      
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(item => {
          return new Promise<void>(resolve => {
            const putRequest = store.put(item);
            putRequest.onsuccess = () => {
              addedCount++;
              resolve();
            };
            putRequest.onerror = () => resolve(); // エラー時も処理続行
          });
        }));
      }
      
      return new Promise(resolve => {
        transaction.oncomplete = () => {
          logInfo(`${addedCount}件のスケジュールデータを保存しました`);
          resolve(true);
        };
        transaction.onerror = () => {
          resolve(addedCount > 0); // 一部成功の場合もtrueを返す
        };
      });
    } catch (error) {
      logError('IndexedDBスケジュールデータ保存エラー:', error);
      return false;
    }
  },
  
  // スケジュールデータ取得
  async getScheduleData(): Promise<ScheduleItem[]> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.SCHEDULE], 'readonly');
      const store = transaction.objectStore(STORES.SCHEDULE);
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          logInfo(`${request.result.length}件のスケジュールデータを読み込みました`);
          resolve(request.result as ScheduleItem[]);
        };
        
        request.onerror = () => {
          reject(new Error('スケジュールデータ取得に失敗しました'));
        };
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
  }
};