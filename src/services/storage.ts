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