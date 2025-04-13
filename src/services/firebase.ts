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
  writeBatch,
  DocumentReference,
  CollectionReference
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

// レイアウトスラッシングを避けるための制御を戻す関数
const yieldToMain = (): Promise<void> => {
  return new Promise(resolve => {
    setTimeout(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    }, 0);
  });
};

// Firebase初期化 - キャッシュとメモ化を使用して無駄な再初期化を防止
let app: any;
let dbInstance: any;
let analyticsInstance: any;

const getApp = () => {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
};

const getDb = () => {
  if (!dbInstance) {
    dbInstance = getFirestore(getApp());
  }
  return dbInstance;
};

// 分析機能（オプション）- エラー耐性を強化
const getAnalyticsInstance = () => {
  if (typeof window !== 'undefined' && !analyticsInstance) {
    try {
      analyticsInstance = getAnalytics(getApp());
    } catch (error) {
      console.log("Analytics not initialized (likely in SSR or non-browser environment)");
      analyticsInstance = null;
    }
  }
  return analyticsInstance;
};

// 初期化 - 必要に応じて実行
const initFirebase = () => {
  getApp();
  getDb();
  getAnalyticsInstance();
};

// コレクション名の定義
const COLLECTIONS = {
  ATTENDANCE: 'attendance',
  SCHEDULE: 'schedule',
  SETTINGS: 'settings'
};

// データ型の定義
interface AttendanceRecord {
  employeeId: string;
  date: string;
  workType: string;
  employeeName?: string;
}

interface ScheduleItem {
  id: string;
  employeeId: string;
  employeeIds?: string[];
  date: string;
  title: string;
  details?: string;
  color?: string;
}

// コレクションの参照をキャッシュして再利用
const collectionRefs: Record<string, CollectionReference> = {};

const getCollection = (collectionName: string): CollectionReference => {
  if (!collectionRefs[collectionName]) {
    collectionRefs[collectionName] = collection(getDb(), collectionName);
  }
  return collectionRefs[collectionName];
};

// エラーロギングを一元化
const logError = (operation: string, error: any): void => {
  console.error(`Firebase ${operation} error:`, error);
};

// 再試行ロジック
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 300
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      // 指数バックオフで待機
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw lastError;
};

// Firebaseサービス
export const FirebaseService = {
  // 初期化チェック
  initialize(): void {
    initFirebase();
  },
  
  // 勤怠データの取得 - エラー処理と再試行を追加
  async getAttendanceData(): Promise<AttendanceRecord[]> {
    try {
      return await withRetry(async () => {
        const attendanceCol = getCollection(COLLECTIONS.ATTENDANCE);
        const snapshot = await getDocs(attendanceCol);
        
        // メインスレッドを解放するためにデータ処理を遅延
        await yieldToMain();
        
        return snapshot.docs.map(doc => doc.data() as AttendanceRecord);
      });
    } catch (error) {
      logError("getAttendanceData", error);
      return [];
    }
  },

  // 勤怠データの保存（効率化版 - 差分更新とチャンク処理）
  async saveAttendanceData(data: AttendanceRecord[], progressCallback?: (progress: number) => void): Promise<boolean> {
    if (!data || data.length === 0) return true;
    
    try {
      // バッチ処理の制限に関する定数
      const BATCH_SIZE = 450;
      const CHUNK_SIZE = 100; // メモリ効率と処理効率のバランスをとる
      
      let successCount = 0;
      let operationsDone = 0;
      let totalOperations = 0;
      
      // 固有IDを生成する関数
      const getRecordId = (record: AttendanceRecord): string => {
        return `${record.employeeId}_${record.date}`;
      };
      
      // 進捗報告の最適化（スロットリング適用）
      let lastReportTime = 0;
      let lastReportedProgress = 0;
      
      const reportProgress = (current: number, total: number) => {
        if (!progressCallback) return;
        
        const now = Date.now();
        const progress = Math.floor((current / total) * 100);
        
        // 小さな変化または短時間での更新はスキップ（UI負荷軽減）
        if (progress - lastReportedProgress < 5 && now - lastReportTime < 200 && progress < 95) {
          return;
        }
        
        lastReportTime = now;
        lastReportedProgress = progress;
        progressCallback(progress);
      };
      
      // 差分分析 - 大量データの効率的な処理
      // 1. データマップの作成（両方向で検索を最適化）
      const newDataMap = new Map<string, AttendanceRecord>();
      
      // チャンク処理でUIブロッキングを防止
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, Math.min(i + CHUNK_SIZE, data.length));
        
        chunk.forEach(record => {
          const recordId = getRecordId(record);
          newDataMap.set(recordId, record);
        });
        
        // 処理の合間にメインスレッドに制御を戻す
        if (i + CHUNK_SIZE < data.length) {
          await yieldToMain();
          reportProgress(i, data.length * 2); // マッピング段階を進捗の前半とする
        }
      }
      
      // 2. 既存データの取得と差分分析
      const existingSnapshot = await getDocs(getCollection(COLLECTIONS.ATTENDANCE));
      await yieldToMain(); // スナップショット取得後に制御を戻す
      
      const existingDataMap = new Map<string, { ref: DocumentReference, data: AttendanceRecord }>();
      const toDelete: DocumentReference[] = [];
      const toUpsert: { id: string, data: AttendanceRecord }[] = [];
      
      // 既存データの処理（チャンク化）
      let processedDocs = 0;
      const totalDocs = existingSnapshot.docs.length;
      
      for (let i = 0; i < totalDocs; i += CHUNK_SIZE) {
        const chunk = existingSnapshot.docs.slice(i, Math.min(i + CHUNK_SIZE, totalDocs));
        
        chunk.forEach(docSnapshot => {
          const data = docSnapshot.data() as AttendanceRecord;
          if (data.employeeId && data.date) {
            const recordId = getRecordId(data);
            existingDataMap.set(recordId, { ref: docSnapshot.ref, data });
            
            // 削除対象の特定（新データに存在しないもの）
            if (!newDataMap.has(recordId)) {
              toDelete.push(docSnapshot.ref);
            }
          }
        });
        
        processedDocs += chunk.length;
        
        // 処理の合間にメインスレッドに制御を戻す
        if (i + CHUNK_SIZE < totalDocs) {
          await yieldToMain();
          reportProgress(data.length + processedDocs, data.length * 2 + totalDocs);
        }
      }
      
      // 3. 更新・追加対象の特定
      // 新データと既存データの差分を識別（チャンク処理）
      const newDataEntries = Array.from(newDataMap.entries());
      
      for (let i = 0; i < newDataEntries.length; i += CHUNK_SIZE) {
        const chunk = newDataEntries.slice(i, Math.min(i + CHUNK_SIZE, newDataEntries.length));
        
        chunk.forEach(([id, newData]) => {
          const existing = existingDataMap.get(id);
          
          if (existing) {
            // 内容が異なる場合のみ更新対象に追加（無駄な操作を減らす）
            if (JSON.stringify(existing.data) !== JSON.stringify(newData)) {
              toUpsert.push({ id, data: newData });
            }
            // 処理済みのIDをマップから削除（メモリ効率化）
            newDataMap.delete(id);
          } else {
            // 既存データにない場合は新規追加
            toUpsert.push({ id, data: newData });
          }
        });
        
        // 処理の合間にメインスレッドに制御を戻す
        if (i + CHUNK_SIZE < newDataEntries.length) {
          await yieldToMain();
        }
      }
      
      // 操作数の集計
      totalOperations = toDelete.length + toUpsert.length;
      
      console.log(`処理内訳: 削除=${toDelete.length}件, 更新/追加=${toUpsert.length}件`);
      
      // バッチ処理の実行 - 最適化されたチャンク処理
      // バッチごとに個別のトランザクションを使用し、一括コミット
      let batchCount = 0;
      
      // 削除操作のバッチ処理
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const chunk = toDelete.slice(i, Math.min(i + BATCH_SIZE, toDelete.length));
        let currentBatch = writeBatch(getDb());
        
        chunk.forEach(ref => {
          currentBatch.delete(ref);
          operationsDone++;
        });
        
        // バッチコミット
        await currentBatch.commit();
        batchCount++;
        
        // UI更新のための制御移譲
        await yieldToMain();
        reportProgress(Math.min(operationsDone, totalOperations), totalOperations);
      }
      
      // 追加・更新操作のバッチ処理
      for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
        const chunk = toUpsert.slice(i, Math.min(i + BATCH_SIZE, toUpsert.length));
        let currentBatch = writeBatch(getDb());
        
        chunk.forEach(({ id, data }) => {
          const docRef = doc(getDb(), COLLECTIONS.ATTENDANCE, id);
          currentBatch.set(docRef, data);
          operationsDone++;
          successCount++;
        });
        
        // バッチコミット
        await currentBatch.commit();
        batchCount++;
        
        // UI更新のための制御移譲
        await yieldToMain();
        reportProgress(Math.min(operationsDone, totalOperations), totalOperations);
      }
      
      console.log(`勤怠データ同期完了: ${batchCount}バッチ, ${successCount}レコード処理`);
      return true;
    } catch (error) {
      logError("saveAttendanceData", error);
      return false;
    }
  },
  
  // 特定の月の勤怠データの削除 - メモリ効率とエラー耐性を強化
  async deleteMonthAttendanceData(yearMonth: string): Promise<boolean> {
    try {
      return await withRetry(async () => {
        const attendanceCol = getCollection(COLLECTIONS.ATTENDANCE);
        
        // 日付範囲でクエリ
        const startDate = `${yearMonth}-01`;
        const endDate = `${yearMonth}-31`;
        
        const q = query(
          attendanceCol, 
          where("date", ">=", startDate),
          where("date", "<=", endDate)
        );
        
        const snapshot = await getDocs(q);
        
        // データが大量にある場合はチャンク処理
        const BATCH_SIZE = 450;
        const docs = snapshot.docs;
        
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const batch = writeBatch(getDb());
          const chunk = docs.slice(i, Math.min(i + BATCH_SIZE, docs.length));
          
          chunk.forEach(document => {
            batch.delete(document.ref);
          });
          
          await batch.commit();
          
          // 処理の合間にメインスレッドに制御を戻す
          if (i + BATCH_SIZE < docs.length) {
            await yieldToMain();
          }
        }
        
        return true;
      });
    } catch (error) {
      logError("deleteMonthAttendanceData", error);
      return false;
    }
  },

  // 予定データの取得 - エラー処理と再試行を追加
  async getScheduleData(): Promise<ScheduleItem[]> {
    try {
      return await withRetry(async () => {
        const scheduleCol = getCollection(COLLECTIONS.SCHEDULE);
        const snapshot = await getDocs(scheduleCol);
        
        // メインスレッドを解放するためにデータ処理を遅延
        await yieldToMain();
        
        return snapshot.docs.map(doc => doc.data() as ScheduleItem);
      });
    } catch (error) {
      logError("getScheduleData", error);
      return [];
    }
  },

  // 予定データの保存（効率化版 - 差分更新とチャンク処理）
  async saveScheduleData(data: ScheduleItem[], progressCallback?: (progress: number) => void): Promise<boolean> {
    if (!data || data.length === 0) return true;
    
    try {
      // バッチ処理の制限に関する定数
      const BATCH_SIZE = 450;
      const CHUNK_SIZE = 100;
      
      let successCount = 0;
      let operationsDone = 0;
      let totalOperations = 0;
      
      // 進捗報告の最適化（スロットリング適用）
      let lastReportTime = 0;
      let lastReportedProgress = 0;
      
      const reportProgress = (current: number, total: number) => {
        if (!progressCallback) return;
        
        const now = Date.now();
        const progress = Math.floor((current / total) * 100);
        
        // 小さな変化または短時間での更新はスキップ（UI負荷軽減）
        if (progress - lastReportedProgress < 5 && now - lastReportTime < 200 && progress < 95) {
          return;
        }
        
        lastReportTime = now;
        lastReportedProgress = progress;
        progressCallback(progress);
      };
      
      // 差分分析のためのマップ作成
      const newDataMap = new Map<string, ScheduleItem>();
      
      // チャンク処理でUIブロッキングを防止
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, Math.min(i + CHUNK_SIZE, data.length));
        
        chunk.forEach(item => {
          newDataMap.set(item.id, item);
        });
        
        // 処理の合間にメインスレッドに制御を戻す
        if (i + CHUNK_SIZE < data.length) {
          await yieldToMain();
          reportProgress(i, data.length * 2); // マッピング段階を進捗の前半とする
        }
      }
      
      // 既存データの取得
      const existingSnapshot = await getDocs(getCollection(COLLECTIONS.SCHEDULE));
      await yieldToMain(); // スナップショット取得後に制御を戻す
      
      // 削除と更新の対象を特定
      const toDelete: DocumentReference[] = [];
      const toUpsert: ScheduleItem[] = [];
      
      // 既存データの処理（チャンク化）
      let processedDocs = 0;
      const totalDocs = existingSnapshot.docs.length;
      
      for (let i = 0; i < totalDocs; i += CHUNK_SIZE) {
        const chunk = existingSnapshot.docs.slice(i, Math.min(i + CHUNK_SIZE, totalDocs));
        
        chunk.forEach(docSnapshot => {
          const itemId = docSnapshot.id;
          const existingData = docSnapshot.data() as ScheduleItem;
          
          if (!newDataMap.has(itemId)) {
            // 新データに存在しない場合は削除対象
            toDelete.push(docSnapshot.ref);
          } else {
            // 内容に変更があるか確認
            const newData = newDataMap.get(itemId)!;
            
            // 内容が異なる場合のみ更新対象に追加
            if (JSON.stringify(existingData) !== JSON.stringify(newData)) {
              toUpsert.push(newData);
            }
            
            // 処理済みのため削除
            newDataMap.delete(itemId);
          }
        });
        
        processedDocs += chunk.length;
        
        // 処理の合間にメインスレッドに制御を戻す
        if (i + CHUNK_SIZE < totalDocs) {
          await yieldToMain();
          reportProgress(data.length + processedDocs, data.length * 2 + totalDocs);
        }
      }
      
      // 残りの新規データを追加
      newDataMap.forEach(item => {
        toUpsert.push(item);
      });
      
      // 操作数の集計
      totalOperations = toDelete.length + toUpsert.length;
      
      console.log(`予定処理内訳: 削除=${toDelete.length}件, 更新/追加=${toUpsert.length}件`);
      
      // バッチ処理の実行（チャンク処理）
      let batchCount = 0;
      
      // 削除操作のバッチ処理
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const chunk = toDelete.slice(i, Math.min(i + BATCH_SIZE, toDelete.length));
        let currentBatch = writeBatch(getDb());
        
        chunk.forEach(ref => {
          currentBatch.delete(ref);
          operationsDone++;
        });
        
        // バッチコミット
        await currentBatch.commit();
        batchCount++;
        
        // UI更新のための制御移譲
        await yieldToMain();
        reportProgress(Math.min(operationsDone, totalOperations), totalOperations);
      }
      
      // 追加・更新操作のバッチ処理
      for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
        const chunk = toUpsert.slice(i, Math.min(i + BATCH_SIZE, toUpsert.length));
        let currentBatch = writeBatch(getDb());
        
        chunk.forEach(item => {
          const docRef = doc(getDb(), COLLECTIONS.SCHEDULE, item.id);
          currentBatch.set(docRef, item);
          operationsDone++;
          successCount++;
        });
        
        // バッチコミット
        await currentBatch.commit();
        batchCount++;
        
        // UI更新のための制御移譲
        await yieldToMain();
        reportProgress(Math.min(operationsDone, totalOperations), totalOperations);
      }
      
      console.log(`予定データ同期完了: ${batchCount}バッチ, ${successCount}レコード処理`);
      return true;
    } catch (error) {
      logError("saveScheduleData", error);
      return false;
    }
  },
  
  // 特定の月の予定データの削除 - メモリ効率とエラー耐性を強化
  async deleteMonthScheduleData(yearMonth: string): Promise<boolean> {
    try {
      return await withRetry(async () => {
        const scheduleCol = getCollection(COLLECTIONS.SCHEDULE);
        
        // 日付範囲でクエリ
        const startDate = `${yearMonth}-01`;
        const endDate = `${yearMonth}-31`;
        
        const q = query(
          scheduleCol, 
          where("date", ">=", startDate),
          where("date", "<=", endDate)
        );
        
        const snapshot = await getDocs(q);
        
        // データが大量にある場合はチャンク処理
        const BATCH_SIZE = 450;
        const docs = snapshot.docs;
        
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const batch = writeBatch(getDb());
          const chunk = docs.slice(i, Math.min(i + BATCH_SIZE, docs.length));
          
          chunk.forEach(document => {
            batch.delete(document.ref);
          });
          
          await batch.commit();
          
          // 処理の合間にメインスレッドに制御を戻す
          if (i + BATCH_SIZE < docs.length) {
            await yieldToMain();
          }
        }
        
        return true;
      });
    } catch (error) {
      logError("deleteMonthScheduleData", error);
      return false;
    }
  },
  
  // 全データ削除 - チャンク処理を導入して大量データにも対応
  async deleteAllData(): Promise<boolean> {
    try {
      // 並列処理で高速化
      const [attendanceSuccess, scheduleSuccess] = await Promise.all([
        this.deleteAllCollectionData(COLLECTIONS.ATTENDANCE),
        this.deleteAllCollectionData(COLLECTIONS.SCHEDULE)
      ]);
      
      return attendanceSuccess && scheduleSuccess;
    } catch (error) {
      logError("deleteAllData", error);
      return false;
    }
  },
  
  // コレクション単位の全削除（内部メソッド）
  async deleteAllCollectionData(collectionName: string): Promise<boolean> {
    try {
      const col = getCollection(collectionName);
      const snapshot = await getDocs(col);
      
      // データが大量にある場合はチャンク処理
      const BATCH_SIZE = 450;
      const docs = snapshot.docs;
      
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(getDb());
        const chunk = docs.slice(i, Math.min(i + BATCH_SIZE, docs.length));
        
        chunk.forEach(document => {
          batch.delete(document.ref);
        });
        
        await batch.commit();
        
        // 処理の合間にメインスレッドに制御を戻す
        if (i + BATCH_SIZE < docs.length) {
          await yieldToMain();
        }
      }
      
      return true;
    } catch (error) {
      logError(`deleteAllCollectionData (${collectionName})`, error);
      return false;
    }
  },
  
  // 設定データの保存 - エラーハンドリング強化
  async saveSettings(key: string, value: any): Promise<boolean> {
    try {
      return await withRetry(async () => {
        const settingsRef = doc(getDb(), COLLECTIONS.SETTINGS, key);
        await setDoc(settingsRef, { value });
        return true;
      });
    } catch (error) {
      logError(`saveSettings (${key})`, error);
      return false;
    }
  },
  
  // 設定データの取得 - エラー処理と再試行を追加
  async getSettings<T>(key: string, defaultValue: T): Promise<T> {
    try {
      return await withRetry(async () => {
        const settingsRef = doc(getDb(), COLLECTIONS.SETTINGS, key);
        const snapshot = await getDoc(settingsRef);
        
        if (snapshot.exists()) {
          return snapshot.data().value as T;
        } else {
          return defaultValue;
        }
      });
    } catch (error) {
      logError(`getSettings (${key})`, error);
      return defaultValue;
    }
  },

  // データサイズ推定を最適化 - メモリ効率とキャッシュを活用
  async estimateStorageSize(): Promise<number> {
    try {
      // より効率的なサイズ推定（分割処理）
      const estimateCollectionSize = async (collectionName: string, bytesPerDoc: number): Promise<number> => {
        const col = getCollection(collectionName);
        const snapshot = await getDocs(col);
        
        // UIブロッキングを避けるため制御を戻す
        await yieldToMain();
        
        // コレクションサイズの推定
        return snapshot.size * bytesPerDoc;
      };
      
      // 並列処理で効率化
      const [attendanceSize, scheduleSize, settingsSize] = await Promise.all([
        estimateCollectionSize(COLLECTIONS.ATTENDANCE, 100), // 1レコードあたり約100バイト
        estimateCollectionSize(COLLECTIONS.SCHEDULE, 200),   // 1レコードあたり約200バイト
        estimateCollectionSize(COLLECTIONS.SETTINGS, 50)     // 1レコードあたり約50バイト
      ]);
      
      // 合計サイズを計算
      let totalSize = attendanceSize + scheduleSize + settingsSize;
      
      // インデックスやメタデータのオーバーヘッドを加算（概算）
      totalSize = totalSize * 1.5;
      
      return totalSize;
    } catch (error) {
      logError("estimateStorageSize", error);
      return 0;
    }
  },
  
  // 接続状態のチェック
  async checkConnection(): Promise<boolean> {
    try {
      // 軽量な操作で接続確認
      const testRef = doc(getDb(), COLLECTIONS.SETTINGS, '_connection_test');
      await setDoc(testRef, { timestamp: Date.now() });
      return true;
    } catch (error) {
      logError("checkConnection", error);
      return false;
    }
  },
  
  // クリーンアップ処理
  cleanup(): void {
    // インスタンスをリセット
    app = null;
    dbInstance = null;
    analyticsInstance = null;
    
    // コレクションキャッシュもクリア
    Object.keys(collectionRefs).forEach(key => {
      delete collectionRefs[key];
    });
  }
};

// 初期化を実行
initFirebase();