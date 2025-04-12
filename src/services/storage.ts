// src/services/storage.ts
import { FirebaseService } from './firebase';
import { IndexedDBService } from './indexedDBService'; 

// ストレージキーの定義
export const STORAGE_KEYS = {
  ATTENDANCE_DATA: 'attendance_data',
  SCHEDULE_DATA: 'schedule_data',
  CURRENT_VIEW: 'current_view',
  CURRENT_DATE: 'current_date',
  SELECTED_EMPLOYEE: 'selected_employee',
  ADMIN_MODE: 'admin_mode',
};

// 設定値
const USE_FIREBASE = true; // Firebaseを使用するかどうか
const USE_INDEXED_DB = true; // IndexedDBを使用するかどうか

// ストレージサービス
export const StorageService = {
  // データ保存 - 優先順位: 1. LocalStorage (常に) 2. IndexedDB (有効時) 3. Firebase (オンライン時)
  async saveData<T>(key: string, data: T, progressCallback?: (stage: string, progress: number) => void): Promise<boolean> {
    let totalSteps = 1; // ローカルストレージは常に使用
    if (USE_INDEXED_DB) totalSteps++;
    if (USE_FIREBASE && navigator.onLine) totalSteps++;
    
    let currentStep = 0;
    
    // 常に最初にローカルストレージに保存を試みる (最も高速なアクセス)
    let localStorageSuccess = false;
    try {
      localStorage.setItem(key, JSON.stringify(data));
      localStorageSuccess = true;
      console.log(`✓ ${key}をローカルストレージに保存しました`);
      
      currentStep++;
      if (progressCallback) progressCallback('localStorage', (currentStep / totalSteps) * 100);
    } catch (error) {
      console.error(`✗ ローカルストレージへの保存に失敗しました: ${key}`, error);
    }
    
    // IndexedDBへの保存 (LocalStorageより容量が大きく、より信頼性が高い)
    let indexedDBSuccess = false;
    if (USE_INDEXED_DB) {
      try {
        if (progressCallback) progressCallback('IndexedDB処理中...', (currentStep / totalSteps) * 100);
        
        // 主要データはIndexedDBにも保存
        if (key === STORAGE_KEYS.ATTENDANCE_DATA) {
          indexedDBSuccess = await IndexedDBService.saveAttendanceData(data as any);
          console.log(`✓ ${key}をIndexedDBに保存しました`);
        } else if (key === STORAGE_KEYS.SCHEDULE_DATA) {
          indexedDBSuccess = await IndexedDBService.saveScheduleData(data as any);
          console.log(`✓ ${key}をIndexedDBに保存しました`);
        } else {
          // 設定データはシンプルなkey-valueとして保存
          indexedDBSuccess = await IndexedDBService.saveSetting(key, data);
          console.log(`✓ ${key}を設定としてIndexedDBに保存しました`);
        }
        
        currentStep++;
        if (progressCallback) progressCallback('IndexedDB', (currentStep / totalSteps) * 100);
      } catch (error) {
        console.error(`✗ IndexedDBへの保存に失敗しました: ${key}`, error);
      }
    }
    
    // Firebaseに保存（オンライン時のみ）
    let firebaseSuccess = false;
    if (USE_FIREBASE && navigator.onLine) {
      try {
        if (progressCallback) progressCallback('Firebase接続中...', (currentStep / totalSteps) * 100);
        
        switch (key) {
          case STORAGE_KEYS.ATTENDANCE_DATA:
            await FirebaseService.saveAttendanceData(data as any);
            firebaseSuccess = true;
            console.log(`✓ ${key}をFirebaseに保存しました`);
            break;
          case STORAGE_KEYS.SCHEDULE_DATA:
            await FirebaseService.saveScheduleData(data as any);
            firebaseSuccess = true;
            console.log(`✓ ${key}をFirebaseに保存しました`);
            break;
          case STORAGE_KEYS.ADMIN_MODE:
          case STORAGE_KEYS.CURRENT_VIEW:
          case STORAGE_KEYS.CURRENT_DATE:
          case STORAGE_KEYS.SELECTED_EMPLOYEE:
            await FirebaseService.saveSettings(key, data);
            firebaseSuccess = true;
            console.log(`✓ ${key}をFirebase設定に保存しました`);
            break;
        }
        
        currentStep++;
        if (progressCallback) progressCallback('Firebase', (currentStep / totalSteps) * 100);
      } catch (error) {
        console.error(`✗ Firebaseへの保存に失敗しました: ${key}`, error);
      }
    }
    
    // 最終ステップでプログレスを100%に設定
    if (progressCallback) progressCallback('完了', 100);
    
    // すべてのストレージ操作が失敗した場合のみfalseを返す
    return localStorageSuccess || indexedDBSuccess || firebaseSuccess;
  },
  
  // ローカルストレージからデータを取得
  getData<T>(key: string, defaultValue: T): T {
    try {
      const savedData = localStorage.getItem(key);
      return savedData ? JSON.parse(savedData) : defaultValue;
    } catch (error) {
      console.error(`✗ ローカルストレージからの読み込みに失敗しました: ${key}`, error);
      return defaultValue;
    }
  },
  
  // データを非同期で取得 - 優先順位: 1. Firebase (オンライン時) 2. IndexedDB 3. LocalStorage
  async getDataAsync<T>(key: string, defaultValue: T): Promise<T> {
    let data = defaultValue;
    let dataSource = "default";
    
    // 1. まずFirebaseから取得を試みる (最新のデータを取得)
    if (USE_FIREBASE && navigator.onLine) {
      try {
        let firebaseData = null;
        
        switch (key) {
          case STORAGE_KEYS.ATTENDANCE_DATA:
            firebaseData = await FirebaseService.getAttendanceData();
            break;
          case STORAGE_KEYS.SCHEDULE_DATA:
            firebaseData = await FirebaseService.getScheduleData();
            break;
          case STORAGE_KEYS.ADMIN_MODE:
          case STORAGE_KEYS.CURRENT_VIEW:
          case STORAGE_KEYS.CURRENT_DATE:
          case STORAGE_KEYS.SELECTED_EMPLOYEE:
            firebaseData = await FirebaseService.getSettings(key, defaultValue);
            break;
        }
        
        if (firebaseData && (Array.isArray(firebaseData) ? firebaseData.length > 0 : true)) {
          data = firebaseData as any;
          dataSource = "Firebase";
          
          // Firebaseから取得できたデータは他のストレージにも保存 (同期化)
          try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log(`✓ Firebase→ローカルストレージに同期: ${key}`);
            
            if (USE_INDEXED_DB) {
              if (key === STORAGE_KEYS.ATTENDANCE_DATA) {
                await IndexedDBService.saveAttendanceData(data as any);
              } else if (key === STORAGE_KEYS.SCHEDULE_DATA) {
                await IndexedDBService.saveScheduleData(data as any);
              } else {
                await IndexedDBService.saveSetting(key, data);
              }
              console.log(`✓ Firebase→IndexedDBに同期: ${key}`);
            }
          } catch (syncError) {
            console.error('✗ Firebaseデータのローカル同期に失敗:', syncError);
          }
        }
      } catch (error) {
        console.warn(`⚠ Firebaseからの読み込みに失敗しました: ${key}`, error);
      }
    }
    
    // 2. Firebaseから取得できなかった場合はIndexedDBを試す
    if (dataSource === "default" && USE_INDEXED_DB) {
      try {
        let indexedDBData = null;
        
        if (key === STORAGE_KEYS.ATTENDANCE_DATA) {
          indexedDBData = await IndexedDBService.getAttendanceData();
        } else if (key === STORAGE_KEYS.SCHEDULE_DATA) {
          indexedDBData = await IndexedDBService.getScheduleData();
        } else {
          indexedDBData = await IndexedDBService.getSetting(key);
        }
        
        if (indexedDBData && (Array.isArray(indexedDBData) ? indexedDBData.length > 0 : true)) {
          data = indexedDBData as any;
          dataSource = "IndexedDB";
          
          // IndexedDBから取得できたデータはローカルストレージにも同期
          try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log(`✓ IndexedDB→ローカルストレージに同期: ${key}`);
          } catch (syncError) {
            console.error('✗ IndexedDBデータのローカル同期に失敗:', syncError);
          }
        }
      } catch (error) {
        console.warn(`⚠ IndexedDBからの読み込みに失敗しました: ${key}`, error);
      }
    }
    
    // 3. 最後にローカルストレージを試す
    if (dataSource === "default") {
      try {
        const localData = this.getData(key, defaultValue);
        if (localData !== defaultValue) {
          data = localData;
          dataSource = "LocalStorage";
        }
      } catch (error) {
        console.error(`✗ ローカルストレージからの読み込みに失敗しました: ${key}`, error);
      }
    }
    
    console.log(`📂 ${key}のデータソース: ${dataSource}`);
    return data;
  },
  
  // 特定の月のデータを削除
  async deleteMonthData(yearMonth: string): Promise<boolean> {
    try {
      // 現在のデータを取得して、対象月以外をフィルタリング
      let attendanceData = this.getData<any[]>(STORAGE_KEYS.ATTENDANCE_DATA, []);
      let scheduleData = this.getData<any[]>(STORAGE_KEYS.SCHEDULE_DATA, []);
      
      attendanceData = attendanceData.filter(item => !item.date.startsWith(yearMonth));
      scheduleData = scheduleData.filter(item => !item.date.startsWith(yearMonth));
      
      // 各ストレージに保存
      let success = false;
      
      // 1. ローカルストレージに保存
      try {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE_DATA, JSON.stringify(attendanceData));
        localStorage.setItem(STORAGE_KEYS.SCHEDULE_DATA, JSON.stringify(scheduleData));
        success = true;
      } catch (error) {
        console.error("✗ フィルタリングデータのローカルストレージ保存に失敗:", error);
      }
      
      // 2. IndexedDBに保存
      if (USE_INDEXED_DB) {
        try {
          await IndexedDBService.saveAttendanceData(attendanceData);
          await IndexedDBService.saveScheduleData(scheduleData);
          success = true;
        } catch (error) {
          console.error("✗ フィルタリングデータのIndexedDB保存に失敗:", error);
        }
      }
      
      // 3. Firebaseから削除
      if (USE_FIREBASE && navigator.onLine) {
        try {
          await Promise.all([
            FirebaseService.deleteMonthAttendanceData(yearMonth),
            FirebaseService.deleteMonthScheduleData(yearMonth)
          ]);
          success = true;
        } catch (error) {
          console.error("✗ Firebaseからの月次データ削除に失敗:", error);
        }
      }
      
      return success;
    } catch (error) {
      console.error("✗ 月次データ削除エラー:", error);
      return false;
    }
  },
  
  // 全データをリセット
  async resetAllData(): Promise<boolean> {
    try {
      let success = false;
      
      // 1. ローカルストレージをクリア
      try {
        localStorage.removeItem(STORAGE_KEYS.ATTENDANCE_DATA);
        localStorage.removeItem(STORAGE_KEYS.SCHEDULE_DATA);
        success = true;
      } catch (error) {
        console.error("✗ ローカルストレージのクリアに失敗:", error);
      }
      
      // 2. IndexedDBをクリア
      if (USE_INDEXED_DB) {
        try {
          await IndexedDBService.clearAll();
          success = true;
        } catch (error) {
          console.error("✗ IndexedDBのクリアに失敗:", error);
        }
      }
      
      // 3. Firebaseをクリア
      if (USE_FIREBASE && navigator.onLine) {
        try {
          await FirebaseService.deleteAllData();
          success = true;
        } catch (error) {
          console.error("✗ Firebaseのクリアに失敗:", error);
        }
      }
      
      return success;
    } catch (error) {
      console.error("✗ 全データリセットエラー:", error);
      return false;
    }
  },
  
  // Firebase Storage情報を取得する関数
  async getFirebaseStorageInfo(): Promise<{ usageGiB: string; maxGiB: string; percentage: string } | null> {
    if (!USE_FIREBASE || !navigator.onLine) return null;
    
    try {
      const usageBytesFromFirebase = await FirebaseService.estimateStorageSize();
      const maxBytes = 1024 * 1024 * 1024; // 1GiB (無料枠)
      
      const usageGiB = (usageBytesFromFirebase / maxBytes).toFixed(6);
      const percentage = ((usageBytesFromFirebase / maxBytes) * 100).toFixed(2) + "%";
      
      return {
        usageGiB: usageGiB + " GiB",
        maxGiB: "1 GiB",
        percentage: percentage
      };
    } catch (error) {
      console.error("✗ Firebase使用状況の取得エラー:", error);
      return {
        usageGiB: "不明",
        maxGiB: "1 GiB",
        percentage: "不明"
      };
    }
  },
  
  // ストレージの総合的な健全性チェック
  async checkStorageHealth(): Promise<{
    localStorage: boolean;
    indexedDB: boolean;
    firebase: boolean;
    totalSuccessCount: number;
  }> {
    const status = {
      localStorage: false,
      indexedDB: false,
      firebase: false,
      totalSuccessCount: 0
    };
    
    // ローカルストレージをチェック
    try {
      const testKey = "_storage_health_check";
      const testValue = { time: Date.now() };
      localStorage.setItem(testKey, JSON.stringify(testValue));
      const retrievedValue = JSON.parse(localStorage.getItem(testKey) || "{}");
      localStorage.removeItem(testKey);
      
      status.localStorage = retrievedValue.time === testValue.time;
      if (status.localStorage) status.totalSuccessCount++;
    } catch (e) {
      console.error("✗ ローカルストレージのヘルスチェックに失敗:", e);
    }
    
    // IndexedDBをチェック
    if (USE_INDEXED_DB) {
      try {
        status.indexedDB = await IndexedDBService.healthCheck();
        if (status.indexedDB) status.totalSuccessCount++;
      } catch (e) {
        console.error("✗ IndexedDBのヘルスチェックに失敗:", e);
      }
    }
    
    // Firebaseをチェック
    if (USE_FIREBASE && navigator.onLine) {
      try {
        // 簡易的な接続チェック
        const timestamp = await FirebaseService.getSettings("_health_check_timestamp", 0);
        status.firebase = true;
        if (status.firebase) status.totalSuccessCount++;
      } catch (e) {
        console.error("✗ Firebaseのヘルスチェックに失敗:", e);
      }
    }
    
    return status;
  },
  
  // ストレージ使用状況確認
  checkStorageWarning(thresholdPercent: number = 70): string | null {
    try {
      const totalBytes = JSON.stringify(localStorage).length;
      const maxBytes = 5 * 1024 * 1024; // 5MB (一般的なブラウザのローカルストレージ上限)
      const usagePercent = (totalBytes / maxBytes) * 100;
      
      if (usagePercent > thresholdPercent) {
        return `ローカルストレージの使用率が${usagePercent.toFixed(1)}%に達しています。データのバックアップをお勧めします。`;
      }
      
      return null;
    } catch (error) {
      console.error("✗ ストレージ使用状況チェックエラー:", error);
      return null;
    }
  },
  
  // ストレージ使用状況の詳細を取得
  getStorageUsage(): {
    totalSize: string;
    usagePercentage: string;
    available: number;
    details: { key: string; size: string }[];
  } {
    try {
      const maxBytes = 5 * 1024 * 1024; // 5MB
      let totalBytes = 0;
      const details: { key: string; size: string }[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || "";
        const value = localStorage.getItem(key) || "";
        const bytes = new Blob([value]).size;
        totalBytes += bytes;
        
        details.push({
          key,
          size: this.formatBytes(bytes),
        });
      }
      
      return {
        totalSize: this.formatBytes(totalBytes),
        usagePercentage: `${((totalBytes / maxBytes) * 100).toFixed(1)}%`,
        available: maxBytes - totalBytes,
        details: details.sort((a, b) => {
          // 文字列からバイト数を取り出す
          const sizeA = parseFloat(a.size.split(' ')[0]);
          const sizeB = parseFloat(b.size.split(' ')[0]);
          
          // 単位を考慮
          const unitA = a.size.split(' ')[1];
          const unitB = b.size.split(' ')[1];
          
          const unitMultiplier = {
            'Bytes': 1,
            'KB': 1024,
            'MB': 1024 * 1024,
            'GB': 1024 * 1024 * 1024
          };
          
          const bytesA = sizeA * (unitMultiplier[unitA as keyof typeof unitMultiplier] || 1);
          const bytesB = sizeB * (unitMultiplier[unitB as keyof typeof unitMultiplier] || 1);
          
          return bytesB - bytesA;
        }),
      };
    } catch (error) {
      console.error("✗ ストレージ使用状況取得エラー:", error);
      return {
        totalSize: "不明",
        usagePercentage: "不明",
        available: 0,
        details: [],
      };
    }
  },
 
// スケジュールアイテムの削除処理
async deleteScheduleItem(id: string, progressCallback?: (stage: string, progress: number) => void): Promise<boolean> {
  console.log(`スケジュールID: ${id} の削除処理を開始`);
  
  if (progressCallback) progressCallback('削除処理開始', 10);
  
  // 1. 現在のデータを取得
  let scheduleData = await this.getDataAsync<any[]>(STORAGE_KEYS.SCHEDULE_DATA, []);
  
  // 2. 対象のIDのスケジュールを除外
  const originalLength = scheduleData.length;
  scheduleData = scheduleData.filter(item => item.id !== id);
  
  if (scheduleData.length === originalLength) {
    console.warn(`⚠ スケジュールID: ${id} は存在しません`);
    return false;
  }
  
  if (progressCallback) progressCallback('データフィルタリング完了', 30);
  
  // 3. すべてのストレージに一貫して保存
  try {
    const success = await this.saveData(STORAGE_KEYS.SCHEDULE_DATA, scheduleData, 
      (stage, progress) => {
        // 進捗30%〜100%の間で同期作業の進捗を反映
        if (progressCallback) progressCallback(stage, 30 + (progress * 0.7));
      }
    );
    
    console.log(`スケジュール削除処理完了: ${success ? '成功' : '失敗'}`);
    return success;
  } catch (error) {
    console.error(`✗ スケジュール削除処理エラー:`, error);
    return false;
  }
},

// 勤務データの削除処理
async deleteAttendanceRecord(employeeId: string, date: string, progressCallback?: (stage: string, progress: number) => void): Promise<boolean> {
  console.log(`勤務データの削除処理を開始: 従業員ID=${employeeId}, 日付=${date}`);
  
  if (progressCallback) progressCallback('削除処理開始', 10);
  
  // 1. 現在のデータを取得 - 非同期で確実に最新データを取得
  let attendanceData = await this.getDataAsync<any[]>(STORAGE_KEYS.ATTENDANCE_DATA, []);
  
  // 2. 対象のレコードを除外
  const originalLength = attendanceData.length;
  attendanceData = attendanceData.filter(
    record => !(record.employeeId === employeeId && record.date === date)
  );
  
  if (attendanceData.length === originalLength) {
    console.warn(`⚠ 対象の勤務レコードが存在しません: 従業員ID=${employeeId}, 日付=${date}`);
    return false;
  }
  
  if (progressCallback) progressCallback('データフィルタリング完了', 30);
  
  // 3. すべてのストレージに一貫して保存
  try {
    const success = await this.saveData(STORAGE_KEYS.ATTENDANCE_DATA, attendanceData, 
      (stage, progress) => {
        // 進捗30%〜100%の間で同期作業の進捗を反映
        if (progressCallback) progressCallback(stage, 30 + (progress * 0.7));
      }
    );
    
    console.log(`勤務レコード削除処理完了: ${success ? '成功' : '失敗'}`);
    return success;
  } catch (error) {
    console.error(`✗ 勤務レコード削除処理エラー:`, error);
    return false;
  }
},

// バイト数のフォーマット
  formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
};