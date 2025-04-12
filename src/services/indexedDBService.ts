// src/services/indexedDBService.ts
import { AttendanceRecord } from '../types';

// ScheduleItemの型定義を追加
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

export const IndexedDBService = {
  // データベース初期化
  async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        console.error('IndexedDB初期化エラー:', event);
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
          console.log('出勤データストアを作成しました');
        }
        
        // スケジュールデータストア
        if (!db.objectStoreNames.contains(STORES.SCHEDULE)) {
          const scheduleStore = db.createObjectStore(STORES.SCHEDULE, { keyPath: 'id' });
          scheduleStore.createIndex('date', 'date', { unique: false });
          console.log('スケジュールストアを作成しました');
        }
        
        // 設定ストア
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
          console.log('設定ストアを作成しました');
        }
      };
    });
  },
  
  // 勤怠データ保存
  async saveAttendanceData(data: AttendanceRecord[]): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.ATTENDANCE], 'readwrite');
      const store = transaction.objectStore(STORES.ATTENDANCE);
      
      // 既存データをクリア - 明示的に完了を待機
      await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
          console.log(`✓ ストア「${STORES.ATTENDANCE}」をクリアしました`);
          resolve();
        };
        
        clearRequest.onerror = (event) => {
          console.error(`✗ ストア「${STORES.ATTENDANCE}」クリアエラー:`, event);
          reject(new Error('Failed to clear attendance store'));
        };
      });
      
      // 各レコードを追加
      let addedCount = 0;
      for (const record of data) {
        // recordにIDがない場合はIDを生成
        const recordWithId = {
          ...record,
          id: record.employeeId && record.date 
            ? `${record.employeeId}_${record.date}`
            : `attendance_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
        };
        
        // 各レコードの追加も明示的に完了を待機
        await new Promise<void>((resolve, reject) => {
          const addRequest = store.add(recordWithId);
          
          addRequest.onsuccess = () => {
            addedCount++;
            resolve();
          };
          
          addRequest.onerror = (event) => {
            console.error('✗ 勤怠データ追加エラー:', event);
            reject(new Error('Failed to add attendance record'));
          };
        });
      }
      
      return new Promise((resolve) => {
        transaction.oncomplete = () => {
          console.log(`✓ ${addedCount}件の勤怠データをIndexedDBに保存しました`);
          resolve(true);
        };
        
        transaction.onerror = (event) => {
          console.error('✗ 勤怠データ保存エラー:', event);
          resolve(false);
        };
      });
    } catch (error) {
      console.error('✗ IndexedDB勤怠データ保存エラー:', error);
      return false;
    }
  },
  
  // 勤怠データ取得
  async getAttendanceData(): Promise<AttendanceRecord[]> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.ATTENDANCE], 'readonly');
      const store = transaction.objectStore(STORES.ATTENDANCE);
      const request = store.getAll();
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const records = request.result.map(record => {
            // IDフィールドを削除して返す（APIと整合性をとるため）
            const { id, ...recordWithoutId } = record;
            return recordWithoutId as AttendanceRecord;
          });
          
          console.log(`✓ ${records.length}件の勤怠データをIndexedDBから読み込みました`);
          resolve(records);
        };
        
        request.onerror = (event) => {
          console.error('✗ 勤怠データ取得エラー:', event);
          reject(new Error('勤怠データ取得に失敗しました'));
        };
      });
    } catch (error) {
      console.error('✗ IndexedDB勤怠データ取得エラー:', error);
      return [];
    }
  },
  
  // スケジュールデータ保存
  async saveScheduleData(data: ScheduleItem[]): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.SCHEDULE], 'readwrite');
      const store = transaction.objectStore(STORES.SCHEDULE);
      
      // 既存データをクリア - 明示的に完了を待機
      await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
          console.log(`✓ ストア「${STORES.SCHEDULE}」をクリアしました`);
          resolve();
        };
        
        clearRequest.onerror = (event) => {
          console.error(`✗ ストア「${STORES.SCHEDULE}」クリアエラー:`, event);
          reject(new Error('Failed to clear schedule store'));
        };
      });
      
      // 各レコードを追加
      let addedCount = 0;
      for (const item of data) {
        // 各レコードの追加も明示的に完了を待機
        await new Promise<void>((resolve, reject) => {
          const addRequest = store.add(item);
          
          addRequest.onsuccess = () => {
            addedCount++;
            resolve();
          };
          
          addRequest.onerror = (event) => {
            console.error('✗ スケジュールデータ追加エラー:', event);
            reject(new Error('Failed to add schedule item'));
          };
        });
      }
      
      return new Promise((resolve) => {
        transaction.oncomplete = () => {
          console.log(`✓ ${addedCount}件のスケジュールデータをIndexedDBに保存しました`);
          resolve(true);
        };
        
        transaction.onerror = (event) => {
          console.error('✗ スケジュールデータ保存エラー:', event);
          resolve(false);
        };
      });
    } catch (error) {
      console.error('✗ IndexedDBスケジュールデータ保存エラー:', error);
      return false;
    }
  },
  
  // スケジュールデータ取得
  async getScheduleData(): Promise<ScheduleItem[]> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.SCHEDULE], 'readonly');
      const store = transaction.objectStore(STORES.SCHEDULE);
      const request = store.getAll();
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log(`✓ ${request.result.length}件のスケジュールデータをIndexedDBから読み込みました`);
          resolve(request.result as ScheduleItem[]);
        };
        
        request.onerror = (event) => {
          console.error('✗ スケジュールデータ取得エラー:', event);
          reject(new Error('スケジュールデータ取得に失敗しました'));
        };
      });
    } catch (error) {
      console.error('✗ IndexedDBスケジュールデータ取得エラー:', error);
      return [];
    }
  },
  
  // 設定の保存
  async saveSetting<T>(key: string, value: T): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.SETTINGS], 'readwrite');
      const store = transaction.objectStore(STORES.SETTINGS);
      
      store.put({ key, value });
      
      return new Promise((resolve) => {
        transaction.oncomplete = () => {
          console.log(`✓ 設定「${key}」をIndexedDBに保存しました`);
          resolve(true);
        };
        
        transaction.onerror = (event) => {
          console.error(`✗ 設定「${key}」保存エラー:`, event);
          resolve(false);
        };
      });
    } catch (error) {
      console.error(`✗ IndexedDB設定保存エラー (${key}):`, error);
      return false;
    }
  },
  
  // 設定の取得
  async getSetting<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([STORES.SETTINGS], 'readonly');
      const store = transaction.objectStore(STORES.SETTINGS);
      const request = store.get(key);
      
      return new Promise((resolve) => {
        request.onsuccess = () => {
          if (request.result) {
            console.log(`✓ 設定「${key}」をIndexedDBから読み込みました`);
            resolve(request.result.value);
          } else {
            console.log(`⚠ 設定「${key}」が見つかりません`);
            resolve(defaultValue);
          }
        };
        
        request.onerror = () => {
          console.error(`✗ 設定「${key}」取得エラー`);
          resolve(defaultValue);
        };
      });
    } catch (error) {
      console.error(`✗ IndexedDB設定取得エラー (${key}):`, error);
      return defaultValue;
    }
  },
  
  // ストアのクリア
  async clearStore(storeName: string): Promise<boolean> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      return new Promise((resolve) => {
        const request = store.clear();
        
        request.onsuccess = () => {
          console.log(`✓ ストア「${storeName}」をクリアしました`);
          
          // トランザクションの完了を確実に待機
          transaction.oncomplete = () => {
            console.log(`✓ 「${storeName}」クリアトランザクションが完了しました`);
            resolve(true);
          };
        };
        
        request.onerror = (event) => {
          console.error(`✗ ストア「${storeName}」クリアエラー:`, event);
          resolve(false);
        };
        
        transaction.onerror = (event) => {
          console.error(`✗ 「${storeName}」クリアトランザクションエラー:`, event);
          resolve(false);
        };
      });
    } catch (error) {
      console.error(`✗ IndexedDBストアクリアエラー (${storeName}):`, error);
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
      
      console.log(`✓ IndexedDBの全データをクリアしました`);
      return success;
    } catch (error) {
      console.error('✗ IndexedDB全データクリアエラー:', error);
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
      console.error('✗ IndexedDBヘルスチェックエラー:', error);
      return false;
    }
  }
};