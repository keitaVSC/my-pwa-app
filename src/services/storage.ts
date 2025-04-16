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
const isDev = process.env.NODE_ENV === 'development';

// ロギング関数
const logInfo = (message: string, ...args: any[]) => {
  if (isDev) console.log(message, ...args);
};

const logError = (message: string, ...args: any[]) => {
  console.error(message, ...args);
};

const logWarn = (message: string, ...args: any[]) => {
  if (isDev) console.warn(message, ...args);
};

// レイアウト更新を待機する関数（レイアウトスラッシングを回避）
const yieldToMain = async (): Promise<void> => {
  return new Promise(resolve => {
    // 次のアニメーションフレームで実行
    requestAnimationFrame(() => {
      // さらに次のマイクロタスクまで待機
      setTimeout(resolve, 0);
    });
  });
};

// undefinedをnullに変換するヘルパー関数
const sanitizeData = <T>(data: T): T => {
  if (Array.isArray(data)) {
    return data.map(item => 
      typeof item === 'object' && item !== null 
        ? sanitizeObjectData(item) 
        : item
    ) as unknown as T;
  } else if (typeof data === 'object' && data !== null) {
    return sanitizeObjectData(data);
  }
  return data;
};

const sanitizeObjectData = <T extends object>(obj: T): T => {
  const result = { ...obj };
  Object.keys(result).forEach(key => {
    const value = result[key as keyof T];
    if (value === undefined) {
      (result as any)[key] = null;
    } else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        (result as any)[key] = value.map(item => 
          typeof item === 'object' && item !== null 
            ? sanitizeObjectData(item) 
            : item === undefined ? null : item
        );
      } else {
        (result as any)[key] = sanitizeObjectData(value);
      }
    }
  });
  return result;
};

// データの識別子を生成する関数 - 重複防止のため
const generateDataId = <T extends { id?: string }>(item: T): string => {
  if (item.id) return item.id;
  
  // IDがない場合はタイムスタンプとランダム文字列を組み合わせて生成
  return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

// ストレージサービス
export const StorageService = {
  // LocalStorage実装の修正版 - チャンク処理を簡素化
  async saveToLocalStorage<T>(key: string, data: T): Promise<boolean> {
    try {
      // データをJSON文字列に変換して保存（undefinedをnullに変換）
      const safeData = sanitizeData(data);
      localStorage.setItem(key, JSON.stringify(safeData));
      logInfo(`${key}をローカルストレージに保存しました`);
      return true;
    } catch (error) {
      logError(`ローカルストレージへの保存に失敗しました: ${key}`, error);
      
      // 容量エラーの場合、必要なアイテムだけを保持
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        try {
          // クリティカルでないデータを削除
          this.cleanupLocalStorage();
          
          // 再試行
          const safeData = sanitizeData(data);
          localStorage.setItem(key, JSON.stringify(safeData));
          return true;
        } catch (retryError) {
          logError('ローカルストレージのクリーンアップ後も保存に失敗:', retryError);
        }
      }
      
      return false;
    }
  },
  
  // ローカルストレージのクリーンアップ（容量不足時）
  cleanupLocalStorage(): void {
    try {
      // 一時的なデータを削除
      const keysToPreserve = [
        STORAGE_KEYS.ATTENDANCE_DATA, 
        STORAGE_KEYS.SCHEDULE_DATA,
        STORAGE_KEYS.CURRENT_VIEW,
        STORAGE_KEYS.CURRENT_DATE,
        STORAGE_KEYS.SELECTED_EMPLOYEE,
        STORAGE_KEYS.ADMIN_MODE
      ];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !keysToPreserve.includes(key) && !key.startsWith('_')) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      logError('ローカルストレージのクリーンアップに失敗:', error);
    }
  },
  
  // データ保存の安定性改善版 - 重複保存防止のための修正
  async saveData<T>(key: string, data: T, progressCallback?: (stage: string, progress: number) => void): Promise<boolean> {
    try {
      // undefinedをnullに変換して安全なデータにする
      const safeData = sanitizeData(data);
      
      // データ保存前に前回のデータが存在するかチェック
      let previousData: any = null;
      try {
        const savedData = localStorage.getItem(key);
        if (savedData) {
          previousData = JSON.parse(savedData);
        }
      } catch (e) {
        // 解析エラーは無視して新規保存として扱う
        logWarn(`前回データの解析エラー: ${key}`, e);
      }
      
      // 前回と同じデータなら保存をスキップする判定（オプション）
      if (previousData && JSON.stringify(previousData) === JSON.stringify(safeData)) {
        logInfo(`${key}のデータに変更がないためスキップします`);
        if (progressCallback) progressCallback('変更なし - スキップ', 100);
        return true;
      }
      
      // ローカルストレージへの保存（最優先で実行）
      if (progressCallback) progressCallback('ローカルストレージに保存中...', 10);
      const localStorageSuccess = await this.saveToLocalStorage(key, safeData);
      
      if (progressCallback) progressCallback('ローカルストレージ完了', 30);
      
      // メインスレッドをブロックしないよう制御を戻す
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // IndexedDBへの保存
      let indexedDBSuccess = false;
      if (USE_INDEXED_DB) {
        if (progressCallback) progressCallback('IndexedDBに保存中...', 40);
        
        try {
          // 主要データはIndexedDBにも保存
          if (key === STORAGE_KEYS.ATTENDANCE_DATA) {
            indexedDBSuccess = await IndexedDBService.saveAttendanceData(safeData as any);
          } else if (key === STORAGE_KEYS.SCHEDULE_DATA) {
            indexedDBSuccess = await IndexedDBService.saveScheduleData(safeData as any);
          } else {
            // 設定データはシンプルなkey-valueとして保存
            indexedDBSuccess = await IndexedDBService.saveSetting(key, safeData);
          }
          
          if (progressCallback) progressCallback('IndexedDB完了', 60);
          
          // UIブロッキングを防止
          await new Promise(resolve => setTimeout(resolve, 10));
        } catch (error) {
          logError(`IndexedDBへの保存に失敗しました: ${key}`, error);
        }
      }
      
      // Firebase保存（オンライン時のみ）
      let firebaseSuccess = false;
      if (USE_FIREBASE && navigator.onLine) {
        if (progressCallback) progressCallback('Firebaseに保存中...', 70);
        
        try {
          switch (key) {
            case STORAGE_KEYS.ATTENDANCE_DATA:
              firebaseSuccess = await FirebaseService.saveAttendanceData(safeData as any);
              break;
            case STORAGE_KEYS.SCHEDULE_DATA:
              firebaseSuccess = await FirebaseService.saveScheduleData(safeData as any);
              break;
            case STORAGE_KEYS.ADMIN_MODE:
            case STORAGE_KEYS.CURRENT_VIEW:
            case STORAGE_KEYS.CURRENT_DATE:
            case STORAGE_KEYS.SELECTED_EMPLOYEE:
              firebaseSuccess = await FirebaseService.saveSettings(key, safeData);
              break;
          }
          
          if (progressCallback) progressCallback('Firebase完了', 100);
        } catch (error) {
          logError(`Firebaseへの保存に失敗しました: ${key}`, error);
        }
      }
      
      // 最終ステップでプログレスを100%に設定
      if (progressCallback) progressCallback('完了', 100);
      
      // すべてのストレージ操作が失敗した場合のみfalseを返す
      return localStorageSuccess || indexedDBSuccess || firebaseSuccess;
    } catch (error) {
      logError(`データ保存エラー: ${key}`, error);
      return false;
    }
  },
  
  // ローカルストレージからデータを取得（最適化版）
  getData<T>(key: string, defaultValue: T): T {
    try {
      const savedData = localStorage.getItem(key);
      if (!savedData) return defaultValue;
      
      // JSON解析を安全に行う
      try {
        return JSON.parse(savedData) as T;
      } catch (parseError) {
        logError(`データの解析に失敗しました: ${key}`, parseError);
        return defaultValue;
      }
    } catch (error) {
      logError(`ローカルストレージからの読み込みに失敗しました: ${key}`, error);
      return defaultValue;
    }
  },
  
  // データを非同期で取得（改善版 - データの整合性確保）
  async getDataAsync<T>(key: string, defaultValue: T): Promise<T> {
    let data = defaultValue;
    let dataSource = "default";
    let dataTimestamp = 0;
    
    // まずローカルストレージから読み込み（高速アクセスのため）
    try {
      const localData = this.getData(key, defaultValue);
      if (localData !== defaultValue) {
        data = localData;
        dataSource = "LocalStorage";
        // データタイムスタンプを現在時刻とする（厳密な比較は難しいため）
        dataTimestamp = Date.now() - 60000; // 1分前と仮定
      }
    } catch (error) {
      logError(`ローカルストレージからの読み込みに失敗しました: ${key}`, error);
    }
    
    // IndexedDBからも読み込み（ローカルストレージより信頼性が高い可能性）
    if (USE_INDEXED_DB) {
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
          // IndexedDBのデータが古い可能性があるため、データ量を比較
          // ここではより多くのデータを持つ方を採用（簡易的な判断）
          const currentDataSize = Array.isArray(data) ? data.length : (data ? 1 : 0);
          const newDataSize = Array.isArray(indexedDBData) ? indexedDBData.length : 1;
          
          if (dataSource === "default" || newDataSize > currentDataSize) {
            data = indexedDBData as any;
            dataSource = "IndexedDB";
            dataTimestamp = Date.now() - 30000; // 30秒前と仮定
            
            // ローカルストレージとの同期（バックグラウンドで実行）
            if (dataSource === "IndexedDB" && newDataSize > currentDataSize) {
              setTimeout(() => {
                this.saveToLocalStorage(key, data).catch(e => 
                  logError('IndexedDBデータのローカル同期に失敗:', e)
                );
              }, 100);
            }
          }
        }
        
        // UIブロッキングを防止
        await yieldToMain();
      } catch (error) {
        logWarn(`IndexedDBからの読み込みに失敗しました: ${key}`, error);
      }
    }
    
    // Firebaseからも読み込み（オンライン時のみ - 最新データの可能性が高い）
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
          // データサイズを比較して採用するか判断
          // ここでは最新（Firebaseから取得したデータ）を優先
          const currentDataSize = Array.isArray(data) ? data.length : (data ? 1 : 0);
          const newDataSize = Array.isArray(firebaseData) ? firebaseData.length : 1;
          
          // Firebaseデータが空でなく、現在のデータより新しいか多い場合に採用
          if (dataSource === "default" || newDataSize >= currentDataSize || 
              (dataSource !== "Firebase" && newDataSize > 0)) {
            data = firebaseData as any;
            dataSource = "Firebase";
            
            // ローカルストレージとIndexedDBに同期（バックグラウンドで実行）
            setTimeout(() => {
              this.saveToLocalStorage(key, data).catch(e => 
                logError('Firebaseデータのローカル保存に失敗:', e)
              );
              
              if (USE_INDEXED_DB) {
                try {
                  if (key === STORAGE_KEYS.ATTENDANCE_DATA) {
                    IndexedDBService.saveAttendanceData(data as any).catch(() => {});
                  } else if (key === STORAGE_KEYS.SCHEDULE_DATA) {
                    IndexedDBService.saveScheduleData(data as any).catch(() => {});
                  } else {
                    IndexedDBService.saveSetting(key, data).catch(() => {});
                  }
                } catch (syncError) {
                  // 同期エラーは無視（重要度低）
                }
              }
            }, 100);
          }
        }
        
        // メインスレッドをブロックしないよう制御を戻す
        await yieldToMain();
      } catch (error) {
        logWarn(`Firebaseからの読み込みに失敗しました: ${key}`, error);
      }
    }
    
    if (isDev) {
      logInfo(`${key}のデータソース: ${dataSource}, サイズ: ${Array.isArray(data) ? data.length : 'N/A'}`);
    }
    
    return data;
  },
    
  // 特定の月のデータを削除（最適化版）
  async deleteMonthData(yearMonth: string): Promise<boolean> {
    try {
      // UIブロッキングを防止するため非同期処理で実装
      
      // 現在のデータを取得して、対象月以外をフィルタリング
      let attendanceData = this.getData<any[]>(STORAGE_KEYS.ATTENDANCE_DATA, []);
      let scheduleData = this.getData<any[]>(STORAGE_KEYS.SCHEDULE_DATA, []);
      
      // 別のスレッドでフィルタリング処理を実行
      await yieldToMain();
      
      attendanceData = attendanceData.filter(item => !item.date.startsWith(yearMonth));
      
      // メインスレッドに制御を戻す
      await yieldToMain();
      
      scheduleData = scheduleData.filter(item => !item.date.startsWith(yearMonth));
      
      // メインスレッドに制御を戻す
      await yieldToMain();
      
      // 保存処理を一元化
      const savePromises = [
        this.saveData(STORAGE_KEYS.ATTENDANCE_DATA, attendanceData),
        this.saveData(STORAGE_KEYS.SCHEDULE_DATA, scheduleData)
      ];
      
      // Firebaseから削除（オンライン時のみ）
      if (USE_FIREBASE && navigator.onLine) {
        try {
          savePromises.push(
            FirebaseService.deleteMonthAttendanceData(yearMonth)
              .then(() => FirebaseService.deleteMonthScheduleData(yearMonth))
          );
        } catch (error) {
          logError("Firebaseからの月次データ削除に失敗:", error);
        }
      }
      
      // すべての保存処理を実行
      const results = await Promise.allSettled(savePromises);
      return results.some(result => result.status === 'fulfilled' && result.value);
      
    } catch (error) {
      logError("月次データ削除エラー:", error);
      return false;
    }
  },
  
  // 全データをリセット（最適化版）
  async resetAllData(): Promise<boolean> {
    try {
      const promises = [];
      
      // 1. ローカルストレージをクリア
      try {
        localStorage.removeItem(STORAGE_KEYS.ATTENDANCE_DATA);
        localStorage.removeItem(STORAGE_KEYS.SCHEDULE_DATA);
      } catch (error) {
        logError("ローカルストレージのクリアに失敗:", error);
      }
      
      // UIスレッドをブロックしないよう制御を戻す
      await yieldToMain();
      
      // 2. IndexedDBをクリア
      if (USE_INDEXED_DB) {
        promises.push(IndexedDBService.clearAll());
      }
      
      // 3. Firebaseをクリア
      if (USE_FIREBASE && navigator.onLine) {
        promises.push(FirebaseService.deleteAllData());
      }
      
      // すべてのプロミスを実行
      if (promises.length > 0) {
        const results = await Promise.allSettled(promises);
        return results.some(result => result.status === 'fulfilled' && result.value);
      }
      
      return true;
    } catch (error) {
      logError("全データリセットエラー:", error);
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
      logError("Firebase使用状況の取得エラー:", error);
      return {
        usageGiB: "不明",
        maxGiB: "1 GiB",
        percentage: "不明"
      };
    }
  },
  
  // ストレージの総合的な健全性チェック（最適化版）
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
      logError("ローカルストレージのヘルスチェックに失敗:", e);
    }
    
    // UIスレッドに制御を戻す
    await yieldToMain();
    
    // IndexedDBをチェック
    if (USE_INDEXED_DB) {
      try {
        status.indexedDB = await IndexedDBService.healthCheck();
        if (status.indexedDB) status.totalSuccessCount++;
      } catch (e) {
        logError("IndexedDBのヘルスチェックに失敗:", e);
      }
    }
    
    // UIスレッドに制御を戻す
    await yieldToMain();
    
    // Firebaseをチェック
    if (USE_FIREBASE && navigator.onLine) {
      try {
        // 簡易的な接続チェック - 最小限の処理で確認
        const timestamp = await FirebaseService.getSettings("_health_check_timestamp", 0);
        status.firebase = true;
        if (status.firebase) status.totalSuccessCount++;
      } catch (e) {
        logError("Firebaseのヘルスチェックに失敗:", e);
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
      logError("ストレージ使用状況チェックエラー:", error);
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
      logError("ストレージ使用状況取得エラー:", error);
      return {
        totalSize: "不明",
        usagePercentage: "不明",
        available: 0,
        details: [],
      };
    }
  },
 
  // スケジュールアイテムの削除処理（最適化版）
  async deleteScheduleItem(id: string, progressCallback?: (stage: string, progress: number) => void): Promise<boolean> {
    try {
      if (progressCallback) progressCallback('削除処理開始', 10);
      
      // 現在のデータを取得
      let scheduleData = await this.getDataAsync<any[]>(STORAGE_KEYS.SCHEDULE_DATA, []);
      
      // メインスレッドに制御を戻す
      await yieldToMain();
      
      // 対象のIDのスケジュールを除外
      const originalLength = scheduleData.length;
      scheduleData = scheduleData.filter(item => item.id !== id);
      
      if (scheduleData.length === originalLength) {
        logWarn(`スケジュールID: ${id} は存在しません`);
        return false;
      }
      
      if (progressCallback) progressCallback('データフィルタリング完了', 30);
      
      // メインスレッドに制御を戻す
      await yieldToMain();
      
      // すべてのストレージに一貫して保存
      const success = await this.saveData(STORAGE_KEYS.SCHEDULE_DATA, scheduleData, 
        (stage, progress) => {
          // 進捗30%〜100%の間で同期作業の進捗を反映
          if (progressCallback) progressCallback(stage, 30 + (progress * 0.7));
        }
      );
      
      return success;
    } catch (error) {
      logError(`スケジュール削除処理エラー:`, error);
      return false;
    }
  },

  // 勤務データの削除処理（最適化版）
  async deleteAttendanceRecord(employeeId: string, date: string, progressCallback?: (stage: string, progress: number) => void): Promise<boolean> {
    try {
      if (progressCallback) progressCallback('削除処理開始', 10);
      
      // 現在のデータを取得
      let attendanceData = await this.getDataAsync<any[]>(STORAGE_KEYS.ATTENDANCE_DATA, []);
      
      // メインスレッドに制御を戻す
      await yieldToMain();
      
      // 対象のレコードを除外
      const originalLength = attendanceData.length;
      attendanceData = attendanceData.filter(
        record => !(record.employeeId === employeeId && record.date === date)
      );
      
      if (attendanceData.length === originalLength) {
        logWarn(`対象の勤務レコードが存在しません: 従業員ID=${employeeId}, 日付=${date}`);
        return false;
      }
      
      if (progressCallback) progressCallback('データフィルタリング完了', 30);
      
      // メインスレッドに制御を戻す
      await yieldToMain();
      
      // すべてのストレージに一貫して保存
      const success = await this.saveData(STORAGE_KEYS.ATTENDANCE_DATA, attendanceData, 
        (stage, progress) => {
          if (progressCallback) progressCallback(stage, 30 + (progress * 0.7));
        }
      );
      
      return success;
    } catch (error) {
      logError(`勤務レコード削除処理エラー:`, error);
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