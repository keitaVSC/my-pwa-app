// src/services/storage.ts

/**
 * LocalStorageを活用したストレージサービス
 */
export class StorageService {
    /**
     * データを永続化する
     * @param key 保存するデータのキー
     * @param data 保存するデータ
     */
    static saveData<T>(key: string, data: T): void {
      try {
        const serializedData = JSON.stringify(data);
        localStorage.setItem(key, serializedData);
      } catch (error) {
        console.error(`データの保存に失敗しました: ${key}`, error);
      }
    }
  
    /**
     * 保存されたデータを取得する
     * @param key 取得するデータのキー
     * @param defaultValue データが存在しない場合のデフォルト値
     * @returns 取得したデータまたはデフォルト値
     */
    static getData<T>(key: string, defaultValue: T): T {
      try {
        const serializedData = localStorage.getItem(key);
        if (serializedData === null) {
          return defaultValue;
        }
        return JSON.parse(serializedData) as T;
      } catch (error) {
        console.error(`データの取得に失敗しました: ${key}`, error);
        return defaultValue;
      }
    }
  
    /**
     * データを削除する
     * @param key 削除するデータのキー
     */
    static removeData(key: string): void {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`データの削除に失敗しました: ${key}`, error);
      }
    }
  
    /**
     * 全てのデータをクリアする
     */
    static clearAllData(): void {
      try {
        localStorage.clear();
      } catch (error) {
        console.error('全データのクリアに失敗しました', error);
      }
    }
  
    /**
     * LocalStorageの使用状況を取得
     * @returns ストレージ使用状況の詳細
     */
    static getStorageUsage() {
      let totalSize = 0;
      let details = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            const size = new Blob([value]).size;
            totalSize += size;
            details.push({
              key,
              size: `${(size / 1024).toFixed(2)} KB`,
              sizeInBytes: size
            });
          }
        }
      }
      
      // 5MBを基準とした使用率を計算（実際のブラウザの制限に依存）
      const usagePercentage = (totalSize / (5 * 1024 * 1024)) * 100;
      
      return {
        totalSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
        totalSizeBytes: totalSize,
        usagePercentage: `${usagePercentage.toFixed(2)}%`,
        available: 5 * 1024 * 1024 - totalSize,
        details
      };
    }
    
    /**
     * ストレージ使用率が高い場合に警告を表示
     * @param warningThreshold 警告表示のしきい値（パーセント）
     * @returns 警告メッセージ（警告なしの場合はnull）
     */
    static checkStorageWarning(warningThreshold = 80) {
      const usage = this.getStorageUsage();
      if (parseFloat(usage.usagePercentage) > warningThreshold) {
        return `LocalStorageの使用率が${usage.usagePercentage}に達しています。不要なデータを削除するか、エクスポートしてバックアップすることをお勧めします。`;
      }
      return null;
    }
  }
  
  /**
   * ストレージキーの定数
   */
  export const STORAGE_KEYS = {
    ATTENDANCE_DATA: 'attendance-data',
    SCHEDULE_DATA: 'schedule-data',
    CURRENT_VIEW: 'current-view',
    CURRENT_DATE: 'current-date',
    SELECTED_EMPLOYEE: 'selected-employee',
    ADMIN_MODE: 'admin-mode',
    SETTINGS: 'app-settings'
  };