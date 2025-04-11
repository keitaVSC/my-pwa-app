// src/services/firebase.ts
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";

// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyBesW6YIlMujK87kTYrZFQbjMyXWHuSxGE",
  authDomain: "attendance-management-ap-d8dab.firebaseapp.com",
  projectId: "attendance-management-ap-d8dab",
  storageBucket: "attendance-management-ap-d8dab.firebasestorage.app",
  messagingSenderId: "193138414339",
  appId: "1:193138414339:web:7de3ba3f14aa5b07ed0f36",
  measurementId: "G-E7E7HFY2RB"
};

// Firebase初期化
export const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// 分析機能（オプション）
let analytics;
try {
  analytics = getAnalytics(app);
} catch (error) {
  console.log("Analytics not initialized (likely in SSR or non-browser environment)");
}

// コレクション名の定義
const COLLECTIONS = {
  ATTENDANCE: 'attendance',
  SCHEDULE: 'schedule',
  SETTINGS: 'settings'
};

// データ型の定義（App.tsxからの型をインポートする代わりに再定義）
interface AttendanceRecord {
  employeeId: string;
  date: string;
  workType: string;
  employeeName?: string;
}

interface ScheduleItem {
  id: string;
  employeeId: string;
  date: string;
  title: string;
  details?: string;
  color?: string;
}

// Firebaseサービス
export const FirebaseService = {
  // 勤怠データの取得
  async getAttendanceData(): Promise<AttendanceRecord[]> {
    try {
      const attendanceCol = collection(db, COLLECTIONS.ATTENDANCE);
      const snapshot = await getDocs(attendanceCol);
      return snapshot.docs.map(doc => doc.data() as AttendanceRecord);
    } catch (error) {
      console.error("Error getting attendance data:", error);
      return [];
    }
  },

  // 勤怠データの保存（効率化版 - 差分更新）
  async saveAttendanceData(data: AttendanceRecord[]): Promise<boolean> {
    try {
      // バッチ処理の制限は500操作まで
      const BATCH_SIZE = 450; 
      let successCount = 0;
      
      // 固有IDを生成するための関数
      const getRecordId = (record: AttendanceRecord): string => {
        return `${record.employeeId}_${record.date}`;
      };
      
      // 新しいデータのIDマップを作成
      const newDataMap = new Map<string, AttendanceRecord>();
      for (const record of data) {
        const recordId = getRecordId(record);
        newDataMap.set(recordId, record);
      }
      
      // 既存のデータを取得
      const attendanceCol = collection(db, COLLECTIONS.ATTENDANCE);
      const existingSnapshot = await getDocs(attendanceCol);
      
      // 既存データのマップを作成
      const existingDataMap = new Map<string, { ref: any, data: any }>();
      existingSnapshot.docs.forEach(doc => {
        const data = doc.data() as AttendanceRecord;
        if (data.employeeId && data.date) {
          const recordId = getRecordId(data);
          existingDataMap.set(recordId, { ref: doc.ref, data });
        }
      });
      
      console.log(`既存レコード: ${existingDataMap.size}件, 新規レコード: ${newDataMap.size}件`);
      
      // 削除対象と追加・更新対象を特定
      const toDelete: any[] = [];
      const toUpsert: { id: string, data: AttendanceRecord }[] = [];
      
      // 削除対象を特定（既存にあって新規にないもの）
      existingDataMap.forEach((item, id) => {
        if (!newDataMap.has(id)) {
          toDelete.push(item.ref);
        } else {
          // 内容が変更されているか確認
          const newData = newDataMap.get(id)!;
          
          // 内容が異なる場合のみ更新対象に追加
          if (JSON.stringify(item.data) !== JSON.stringify(newData)) {
            toUpsert.push({ id, data: newData });
          }
          
          // 処理済みなので削除
          newDataMap.delete(id);
        }
      });
      
      // 残りは全て新規追加対象
      newDataMap.forEach((record, id) => {
        toUpsert.push({ id, data: record });
      });
      
      console.log(`処理内訳: 削除=${toDelete.length}件, 更新/追加=${toUpsert.length}件`);
      
      // バッチに分けて処理する
      let batchCount = 0;
      let currentBatch = writeBatch(db);
      let operationCount = 0;
      
      // 1. 削除処理
      for (const ref of toDelete) {
        currentBatch.delete(ref);
        operationCount++;
        
        if (operationCount >= BATCH_SIZE) {
          await currentBatch.commit();
          batchCount++;
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      }
      
      // 2. 追加・更新処理
      for (const { id, data } of toUpsert) {
        // docIdはemployeeId_dateの形式で一意になる
        const docRef = doc(db, COLLECTIONS.ATTENDANCE, id);
        currentBatch.set(docRef, data);
        operationCount++;
        successCount++;
        
        if (operationCount >= BATCH_SIZE) {
          await currentBatch.commit();
          batchCount++;
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      }
      
      // 残りの操作をコミット
      if (operationCount > 0) {
        await currentBatch.commit();
        batchCount++;
      }
      
      console.log(`勤怠データ同期完了: ${batchCount}バッチ, ${successCount}レコード処理`);
      return true;
    } catch (error) {
      console.error("Error saving attendance data:", error);
      return false;
    }
  },
  
  // 特定の月の勤怠データの削除
  async deleteMonthAttendanceData(yearMonth: string): Promise<boolean> {
    try {
      const attendanceCol = collection(db, COLLECTIONS.ATTENDANCE);
      const q = query(attendanceCol, where("date", ">=", `${yearMonth}-01`), 
                      where("date", "<=", `${yearMonth}-31`));
      
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach(document => {
        batch.delete(document.ref);
      });
      
      await batch.commit();
      return true;
    } catch (error) {
      console.error("Error deleting month attendance data:", error);
      return false;
    }
  },

  // 予定データの取得
  async getScheduleData(): Promise<ScheduleItem[]> {
    try {
      const scheduleCol = collection(db, COLLECTIONS.SCHEDULE);
      const snapshot = await getDocs(scheduleCol);
      return snapshot.docs.map(doc => doc.data() as ScheduleItem);
    } catch (error) {
      console.error("Error getting schedule data:", error);
      return [];
    }
  },

  // 予定データの保存（効率化版 - 差分更新）
  async saveScheduleData(data: ScheduleItem[]): Promise<boolean> {
    try {
      // バッチ処理の制限は500操作まで
      const BATCH_SIZE = 450;
      let successCount = 0;
      
      // 新しいデータのIDマップを作成
      const newDataMap = new Map<string, ScheduleItem>();
      data.forEach(item => {
        newDataMap.set(item.id, item);
      });
      
      // 既存のデータを取得
      const scheduleCol = collection(db, COLLECTIONS.SCHEDULE);
      const existingSnapshot = await getDocs(scheduleCol);
      
      // 削除対象と追加・更新対象を特定
      const toDelete: any[] = [];
      const toUpsert: ScheduleItem[] = [];
      
      // 既存データの処理
      existingSnapshot.docs.forEach(doc => {
        const itemId = doc.id;
        const existingData = doc.data() as ScheduleItem;
        
        if (!newDataMap.has(itemId)) {
          // 新しいデータに存在しないので削除
          toDelete.push(doc.ref);
        } else {
          // 内容に変更があるか確認
          const newData = newDataMap.get(itemId)!;
          
          // 内容が異なる場合のみ更新対象に追加
          if (JSON.stringify(existingData) !== JSON.stringify(newData)) {
            toUpsert.push(newData);
          }
          
          // 処理済みなので削除
          newDataMap.delete(itemId);
        }
      });
      
      // 残りは全て新規追加
      newDataMap.forEach(item => {
        toUpsert.push(item);
      });
      
      console.log(`予定処理内訳: 削除=${toDelete.length}件, 更新/追加=${toUpsert.length}件`);
      
      // バッチ処理
      let batchCount = 0;
      let currentBatch = writeBatch(db);
      let operationCount = 0;
      
      // 1. 削除処理
      for (const ref of toDelete) {
        currentBatch.delete(ref);
        operationCount++;
        
        if (operationCount >= BATCH_SIZE) {
          await currentBatch.commit();
          batchCount++;
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      }
      
      // 2. 追加・更新処理
      for (const item of toUpsert) {
        const docRef = doc(db, COLLECTIONS.SCHEDULE, item.id);
        currentBatch.set(docRef, item);
        operationCount++;
        successCount++;
        
        if (operationCount >= BATCH_SIZE) {
          await currentBatch.commit();
          batchCount++;
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      }
      
      // 残りの操作をコミット
      if (operationCount > 0) {
        await currentBatch.commit();
        batchCount++;
      }
      
      console.log(`予定データ同期完了: ${batchCount}バッチ, ${successCount}レコード処理`);
      return true;
    } catch (error) {
      console.error("Error saving schedule data:", error);
      return false;
    }
  },
  
  // 特定の月の予定データの削除
  async deleteMonthScheduleData(yearMonth: string): Promise<boolean> {
    try {
      const scheduleCol = collection(db, COLLECTIONS.SCHEDULE);
      const q = query(scheduleCol, where("date", ">=", `${yearMonth}-01`), 
                      where("date", "<=", `${yearMonth}-31`));
      
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach(document => {
        batch.delete(document.ref);
      });
      
      await batch.commit();
      return true;
    } catch (error) {
      console.error("Error deleting month schedule data:", error);
      return false;
    }
  },
  
  // 全データ削除
  async deleteAllData(): Promise<boolean> {
    try {
      // 勤怠データ削除
      const attendanceCol = collection(db, COLLECTIONS.ATTENDANCE);
      const attendanceSnapshot = await getDocs(attendanceCol);
      
      const scheduletCol = collection(db, COLLECTIONS.SCHEDULE);
      const scheduleSnapshot = await getDocs(scheduletCol);
      
      const batch = writeBatch(db);
      
      attendanceSnapshot.docs.forEach(document => {
        batch.delete(document.ref);
      });
      
      scheduleSnapshot.docs.forEach(document => {
        batch.delete(document.ref);
      });
      
      await batch.commit();
      return true;
    } catch (error) {
      console.error("Error deleting all data:", error);
      return false;
    }
  },
  
  // 設定データの保存
  async saveSettings(key: string, value: any): Promise<boolean> {
    try {
      const settingsRef = doc(db, COLLECTIONS.SETTINGS, key);
      await setDoc(settingsRef, { value });
      return true;
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
      return false;
    }
  },
  
  // 設定データの取得
  async getSettings<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const settingsRef = doc(db, COLLECTIONS.SETTINGS, key);
      const snapshot = await getDoc(settingsRef);
      
      if (snapshot.exists()) {
        return snapshot.data().value as T;
      } else {
        return defaultValue;
      }
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return defaultValue;
    }
  },

  // 保存データサイズ推定関数
  async estimateStorageSize(): Promise<number> {
    try {
      // 各コレクションのドキュメント数とサイズを計算
      let totalSize = 0;
      
      // 勤怠データのサイズを推定
      const attendanceCol = collection(db, COLLECTIONS.ATTENDANCE);
      const attendanceSnapshot = await getDocs(attendanceCol);
      const attendanceCount = attendanceSnapshot.size;
      
      // 1レコードあたり約100バイトと仮定
      const attendanceSize = attendanceCount * 100;
      totalSize += attendanceSize;
      
      // 予定データのサイズを推定
      const scheduleCol = collection(db, COLLECTIONS.SCHEDULE);
      const scheduleSnapshot = await getDocs(scheduleCol);
      const scheduleCount = scheduleSnapshot.size;
      
      // 1レコードあたり約200バイトと仮定
      const scheduleSize = scheduleCount * 200;
      totalSize += scheduleSize;
      
      // 設定データのサイズを推定
      const settingsCol = collection(db, COLLECTIONS.SETTINGS);
      const settingsSnapshot = await getDocs(settingsCol);
      const settingsCount = settingsSnapshot.size;
      
      // 1レコードあたり約50バイトと仮定
      const settingsSize = settingsCount * 50;
      totalSize += settingsSize;
      
      // インデックスやメタデータのオーバーヘッドを加算（概算）
      totalSize = totalSize * 1.5;
      
      return totalSize;
    } catch (error) {
      console.error("Error estimating storage size:", error);
      return 0;
    }
  }
};