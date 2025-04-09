// src/services/storage.ts
import { FirebaseService } from './firebase';

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

// ストレージサービス
export const StorageService = {
  // データ保存
  async saveData<T>(key: string, data: T): Promise<boolean> {
    // ローカルストレージに保存
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`Error saving to localStorage: ${key}`, error);
      return false;
    }
    
    // Firebaseに保存（特定のデータのみ）
    if (USE_FIREBASE && navigator.onLine) {
      try {
        switch (key) {
          case STORAGE_KEYS.ATTENDANCE_DATA:
            await FirebaseService.saveAttendanceData(data as any);
            break;
          case STORAGE_KEYS.SCHEDULE_DATA:
            await FirebaseService.saveScheduleData(data as any);
            break;
          case STORAGE_KEYS.ADMIN_MODE:
          case STORAGE_KEYS.CURRENT_VIEW:
          case STORAGE_KEYS.CURRENT_DATE:
          case STORAGE_KEYS.SELECTED_EMPLOYEE:
            await FirebaseService.saveSettings(key, data);
            break;
        }
        return true;
      } catch (error) {
        console.error(`Error saving to Firebase: ${key}`, error);
        return false;
      }
    }
    
    return true; // ローカルストレージへの保存が成功した場合
  },
  
  // データ取得
  getData<T>(key: string, defaultValue: T): T {
    try {
      const savedData = localStorage.getItem(key);
      return savedData ? JSON.parse(savedData) : defaultValue;
    } catch (error) {
      console.error(`Error loading from localStorage: ${key}`, error);
      return defaultValue;
    }
  },
  
  // データを非同期で取得（Firebase対応）
  async getDataAsync<T>(key: string, defaultValue: T): Promise<T> {
    if (USE_FIREBASE && navigator.onLine) {
      try {
        switch (key) {
          case STORAGE_KEYS.ATTENDANCE_DATA:
            const fbAttendance = await FirebaseService.getAttendanceData();
            if (fbAttendance && fbAttendance.length > 0) {
              // 最新データをローカルストレージにも保存
              try {
                localStorage.setItem(key, JSON.stringify(fbAttendance));
              } catch (error) {
                console.error(`Error saving Firebase data to localStorage: ${key}`, error);
              }
              return fbAttendance as any;
            }
            break;
          case STORAGE_KEYS.SCHEDULE_DATA:
            const fbSchedule = await FirebaseService.getScheduleData();
            if (fbSchedule && fbSchedule.length > 0) {
              // 最新データをローカルストレージにも保存
              try {
                localStorage.setItem(key, JSON.stringify(fbSchedule));
              } catch (error) {
                console.error(`Error saving Firebase data to localStorage: ${key}`, error);
              }
              return fbSchedule as any;
            }
            break;
          case STORAGE_KEYS.ADMIN_MODE:
          case STORAGE_KEYS.CURRENT_VIEW:
          case STORAGE_KEYS.CURRENT_DATE:
          case STORAGE_KEYS.SELECTED_EMPLOYEE:
            return await FirebaseService.getSettings(key, defaultValue);
          default:
            return this.getData(key, defaultValue);
        }
      } catch (error) {
        console.error(`Error loading from Firebase: ${key}`, error);
        // Firebaseが失敗した場合、ローカルストレージから取得
        console.log(`Fallback to localStorage for: ${key}`);
      }
    }
    
    // オフラインまたはFirebaseの取得に失敗した場合は、ローカルストレージから取得
    console.log(`Getting data from localStorage for: ${key}`);
    return this.getData(key, defaultValue);
  },
  
  // 特定の月のデータを削除
  async deleteMonthData(yearMonth: string): Promise<boolean> {
    try {
      // 現在のデータを取得
      let attendanceData = this.getData<any[]>(STORAGE_KEYS.ATTENDANCE_DATA, []);
      let scheduleData = this.getData<any[]>(STORAGE_KEYS.SCHEDULE_DATA, []);
      
      // 対象月以外のデータをフィルタリング
      attendanceData = attendanceData.filter(item => !item.date.startsWith(yearMonth));
      scheduleData = scheduleData.filter(item => !item.date.startsWith(yearMonth));
      
      // ローカルストレージに保存
      try {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE_DATA, JSON.stringify(attendanceData));
        localStorage.setItem(STORAGE_KEYS.SCHEDULE_DATA, JSON.stringify(scheduleData));
      } catch (error) {
        console.error("Error saving filtered data to localStorage", error);
      }
      
      // Firebaseにも反映（オンラインの場合のみ）
      if (USE_FIREBASE && navigator.onLine) {
        await Promise.all([
          FirebaseService.deleteMonthAttendanceData(yearMonth),
          FirebaseService.deleteMonthScheduleData(yearMonth)
        ]);
      }
      
      return true;
    } catch (error) {
      console.error("Error deleting month data:", error);
      return false;
    }
  },
  
  // 全データをリセット
  async resetAllData(): Promise<boolean> {
    try {
      // ローカルストレージをクリア
      try {
        localStorage.removeItem(STORAGE_KEYS.ATTENDANCE_DATA);
        localStorage.removeItem(STORAGE_KEYS.SCHEDULE_DATA);
      } catch (error) {
        console.error("Error clearing localStorage", error);
      }
      
      // Firebaseもクリア（オンラインの場合のみ）
      if (USE_FIREBASE && navigator.onLine) {
        await FirebaseService.deleteAllData();
      }
      
      return true;
    } catch (error) {
      console.error("Error resetting all data:", error);
      return false;
    }
  },
  
  // Firebase Storage情報を取得する関数
  async getFirebaseStorageInfo(): Promise<{ usageGiB: string; maxGiB: string; percentage: string } | null> {
    if (!USE_FIREBASE || !navigator.onLine) return null;
    
    try {
      // Firebaseの使用状況を取得
      // この部分はFirebaseの実際のAPIに合わせて調整してください
      // 例: Firebase Admin SDKを使用した場合など
      
      // ダミーデータ（Firebase Firestoreの無料枠は1GiBなのでそれを基準にしています）
      // 実際はFirebase Adminの情報を取得
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
      console.error("Error getting Firebase storage info:", error);
      return {
        usageGiB: "不明",
        maxGiB: "1 GiB",
        percentage: "不明"
      };
    }
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
      console.error("Error checking storage usage:", error);
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
        details: details.sort((a, b) => 
          parseInt(b.size) - parseInt(a.size)
        ),
      };
    } catch (error) {
      console.error("Error getting storage usage:", error);
      return {
        totalSize: "不明",
        usagePercentage: "不明",
        available: 0,
        details: [],
      };
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