// src/App.tsx

import React, { useState, useEffect, useRef } from "react";
import { format, parse, isSameMonth, addMonths, subMonths, startOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import JapaneseHolidays from "japanese-holidays";
import Modal from "./components/Modal";
import ConfirmModal from "./components/ConfirmModal";
import SuccessModal from "./components/SuccessModal";
import ErrorBoundary from "./components/ErrorBoundary";
import SyncButton from "./components/SyncButton";
import OfflineIndicatorComponent from "./components/OfflineIndicator";
import './styles/sync-button.css'; // SyncButtonのスタイルをインポート
import './styles/offline-indicator.css'; // OfflineIndicatorのスタイルをインポート
import { StorageService, STORAGE_KEYS } from "./services/storage";
import './index.css'; // メインのスタイルをインポート
import { IndexedDBService } from './services/indexedDBService';

// Japanese-holidaysの型定義
declare module "japanese-holidays" {
  export function isHoliday(date: Date): string | undefined;
}

//=====================================================================
// Part 1: ヘルパー関数（祝日関連の処理）
//=====================================================================

// 祝日判定関数
const isJapaneseHoliday = (date: Date): boolean => {
  return JapaneseHolidays.isHoliday(date) !== undefined;
};

// 祝日名を取得する関数
const getHolidayName = (date: Date): string | null => {
  const holiday = JapaneseHolidays.isHoliday(date);
  return holiday || null;
};

// 背景色判定関数
const getCellBackgroundColor = (date: Date) => {
  if (date.getDay() === 0 || isJapaneseHoliday(date)) {
    return {
      bg: "bg-red-50",
      hover: "hover:bg-red-100",
      text: "text-red-500",
    };
  }
  if (date.getDay() === 6) {
    return {
      bg: "bg-blue-50",
      hover: "hover:bg-blue-100",
      text: "text-blue-500",
    };
  }
  return {
    bg: "",
    hover: "hover:bg-gray-50",
    text: "",
  };
};
//=====================================================================
// Part 2: 型定義
//=====================================================================

// 従業員
interface Employee {
  id: number;
  name: string;
}

// 勤務区分
interface WorkType {
  id: string;
  label: string;
}

// 勤務記録
import { AttendanceRecord } from "./types";

// 予定
interface ScheduleItem {
  id: string;
  employeeId: string;  // 後方互換性のために維持
  employeeIds: string[]; // 複数従業員対応
  date: string;
  title: string;
  details?: string;
  color?: string;
}

// 日次集計
interface DailySummary {
  [workType: string]: number;
}

// 表示モード
type View = "calendar" | "table" | "singleEmployeeCalendar";

// カラー選択オプション
interface ColorOption {
  name: string;
  value: string;
}

// プリセットカラー
const PRESET_COLORS: ColorOption[] = [
  { name: "青", value: "#4A90E2" },
  { name: "赤", value: "#E24A4A" },
  { name: "緑", value: "#4AE27A" },
  { name: "オレンジ", value: "#E2A14A" },
  { name: "ピンク", value: "#E24A9E" }
];

// カウント除外する従業員のID
const EXCLUDED_EMPLOYEE_IDS = [23, 24, 25, 26, 27];

// 勤務区分の表示順
const WORK_TYPE_DISPLAY_ORDER = [
  "休", "年", "Ap", "a3/P", "a2/P", "a1/P", "A/p3", "A/p2", "A/p1", 
  "A", "P", "半1", "半5", "a", "p", "a3", "a2", "a1", "p3", "p2", "p1",
  // 残りの勤務区分（順序指定外）
  "Fビ", "日", "遅1", "遅2", "早1", "早2", "短", "短土", "特"
];

//=====================================================================
// Part 3: 初期データ
//=====================================================================

// 従業員リスト
const employees: Employee[] = [
  { id: 1, name: "小田　孝" },
  { id: 2, name: "益田　洋史" },
  { id: 3, name: "佐藤　徳保" },
  { id: 4, name: "吉野　広一郎" },
  { id: 5, name: "田口　祐介" },
  { id: 6, name: "江沢　侑也" },
  { id: 7, name: "吉田　結" },
  { id: 8, name: "山田　慧太" },
  { id: 9, name: "上村　沙奈恵" },
  { id: 10, name: "濱村　大和" },
  { id: 11, name: "岡　出海" },
  { id: 12, name: "赤神　龍誠" },
  { id: 13, name: "佐取　侑平" },
  { id: 14, name: "池島　凌太" },
  { id: 15, name: "木村　汐里" },
  { id: 16, name: "今井　淳貴" },
  { id: 17, name: "若木　雄太" }, // 順序変更
  { id: 18, name: "藤田　向陽" }, // 順序変更
  { id: 19, name: "中谷　優衣" },
  { id: 20, name: "濱田　泰陽" },
  { id: 21, name: "佐々木　幹也" },
  { id: 22, name: "前田　愛都" },
  { id: 23, name: "益田　幸枝" },
  { id: 24, name: "井上　真理子" },
  { id: 25, name: "斎藤　綾子" }, // 名前変更
  { id: 26, name: "越野　裕太" },
  { id: 27, name: "非常勤（桑原　真尋）" } // 名前変更
];

// 勤務区分リスト
const workTypes: WorkType[] = [
  { id: "休", label: "休" },
  { id: "A", label: "A" },
  { id: "P", label: "P" },
  { id: "年", label: "年" },
  { id: "a", label: "a" },
  { id: "p", label: "p" },
  { id: "Ap", label: "Ap" },
  { id: "Fビ", label: "Fビ" },
  { id: "a1", label: "a1" },
  { id: "a2", label: "a2" },
  { id: "a3", label: "a3" },
  { id: "p1", label: "p1" },
  { id: "p2", label: "p2" },
  { id: "p3", label: "p3" },
  { id: "a1/P", label: "a1/P" },
  { id: "a2/P", label: "a2/P" },
  { id: "A/p1", label: "A/p1" },
  { id: "A/p2", label: "A/p2" },
  { id: "a1/p", label: "a1/p" },
  { id: "a2/p", label: "a2/p" },
  { id: "a/p1", label: "a/p1" },
  { id: "a/p2", label: "a/p2" },
  { id: "日", label: "日" },
  { id: "遅1", label: "遅1" },
  { id: "遅2", label: "遅2" },
  { id: "早1", label: "早1" },
  { id: "早2", label: "早2" },
  { id: "半1", label: "半1" },
  { id: "半5", label: "半5" },
  { id: "短", label: "短" },
  { id: "短土", label: "短土" },
  { id: "特", label: "特" },
];
//=====================================================================
// Part 4: メインコンポーネント
//=====================================================================
const AttendanceApp: React.FC = () => {
  //---------------------------------------------------------------
  // 状態管理
  //---------------------------------------------------------------
  // 表示関連
  const [currentView, setCurrentView] = useState<View>("calendar");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");

  // データ関連
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // オフライン状態の管理
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [pendingChanges, setPendingChanges] = useState<boolean>(false);
  
  // スクロール位置のグローバル管理
  const [globalScrollPosition, setGlobalScrollPosition] = useState({ x: 0, y: 0 });
  const tableContainerGlobalRef = useRef<HTMLDivElement | null>(null);

  // Firebase使用状況
  const [firebaseStorageInfo, setFirebaseStorageInfo] = useState<{
    usageGiB: string;
    maxGiB: string;
    percentage: string;
  }>({ usageGiB: "0", maxGiB: "1", percentage: "0" });

  // モーダル関連
  const [showWorkTypeModal, setShowWorkTypeModal] = useState(false);
  const [showAttendanceDetailModal, setShowAttendanceDetailModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalMessage, setConfirmModalMessage] = useState("");
  const [confirmModalAction, setConfirmModalAction] = useState<() => void>(() => {});
  const [successMessage, setSuccessMessage] = useState("");

  // 月選択モーダル関連
  const [showMonthSelectionModal, setShowMonthSelectionModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Date>(currentDate);
  const [monthSelectionMode, setMonthSelectionMode] = useState<"export" | "reset">("export");

  // ストレージ使用状況表示用の状態
  const [showStorageUsageModal, setShowStorageUsageModal] = useState(false);
  const [storageUsageData, setStorageUsageData] = useState<any>(null);

  // セル・日付選択関連
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: number;
    date: Date;
  } | null>(null);
  
  const [selectedDateDetails, setSelectedDateDetails] = useState<{
    date: Date;
    records: AttendanceRecord[];
  } | null>(null);
  
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Date | null>(null);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState<ScheduleItem | null>(null);

  // 管理者モード関連
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [isBulkEditMode, setIsBulkEditMode] = useState<boolean>(false);
  const [selectedCells, setSelectedCells] = useState<{
    employeeId: number;
    date: Date;
  }[]>([]);

  // スマホ向け機能
  const [isMobileSelectMode, setIsMobileSelectMode] = useState<boolean>(false);
  
  // キー状態
  const [isCtrlPressed, setIsCtrlPressed] = useState<boolean>(false);

  // トースト通知
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "info" | "warning";
  }>({
    show: false,
    message: "",
    type: "info",
  });

    // 同期進捗状態
    const [syncProgress, setSyncProgress] = useState<{
      show: boolean;
      progress: number; 
      stage: string;
    }>({
      show: false,
      progress: 0,
      stage: ''
    });

  //---------------------------------------------------------------
  // 副作用（useEffect）
  //---------------------------------------------------------------
  // データの初期化を非同期で行う
// 2. 初期ロード時のデータ読み込み処理を強化
useEffect(() => {
  const initializeData = async () => {
    setIsLoading(true);
    
    try {
      // オフライン状態を先に確認
      const isNetworkOffline = !navigator.onLine;
      setIsOffline(isNetworkOffline);
      
      // ストレージの健全性チェックを行う
      const storageHealth = await StorageService.checkStorageHealth();
      console.log('ストレージ健全性:', storageHealth);
      
      // データ読み込み
      const attendance = await StorageService.getDataAsync<AttendanceRecord[]>(
        STORAGE_KEYS.ATTENDANCE_DATA, []
      );
      const schedule = await StorageService.getDataAsync<ScheduleItem[]>(
        STORAGE_KEYS.SCHEDULE_DATA, []
      );
      
      // 状態を更新
      setAttendanceData(attendance);
      setScheduleData(schedule);
      
      // 設定も同様に読み込み
      const currentView = await StorageService.getDataAsync<View>(
        STORAGE_KEYS.CURRENT_VIEW, "calendar"
      );
      const savedDateStr = await StorageService.getDataAsync<string>(
        STORAGE_KEYS.CURRENT_DATE, ""
      );
      const selectedEmp = await StorageService.getDataAsync<string>(
        STORAGE_KEYS.SELECTED_EMPLOYEE, ""
      );
      const adminMode = await StorageService.getDataAsync<boolean>(
        STORAGE_KEYS.ADMIN_MODE, false
      );
      
      // 日付データの処理
      const currentDateTime = savedDateStr ? new Date(savedDateStr) : new Date();
      
      // 各設定を適用
      setCurrentView(currentView);
      setCurrentDate(currentDateTime);
      setSelectedMonth(currentDateTime);
      setSelectedEmployee(selectedEmp);
      setIsAdminMode(adminMode);
      
      // ストレージ使用状況確認
      if (adminMode) {
        const warning = StorageService.checkStorageWarning(70);
        if (warning) {
          showToast(warning, "warning");
        }
      }
      
      // Firebase情報は管理者モードかつオンライン時のみ
      if (adminMode && !isNetworkOffline) {
        const firebaseInfo = await StorageService.getFirebaseStorageInfo();
        if (firebaseInfo) {
          setFirebaseStorageInfo(firebaseInfo);
        }
      }
      
      // オフライン時の通知
      if (isNetworkOffline) {
        showToast("オフライン状態のため、ローカルデータを使用しています", "info");
      }
      
      // 未同期データがあるかチェック
      if (!isNetworkOffline && (attendance.length > 0 || schedule.length > 0)) {
        setPendingChanges(true);
      }
    } catch (error) {
      console.error("データ初期化エラー:", error);
      showToast("データの読み込みに問題が発生しました。ページを再読み込みしてください", "error");
    } finally {
      setIsLoading(false);
    }
  };
  
  initializeData();
}, []);

  // コンポーネントマウント時の処理
  useEffect(() => {
    console.log("App component mounted");
    
    // キーボードイベントリスナーの設定
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown as any);
    window.addEventListener('keyup', handleKeyUp as any);
    
    // ピンチズーム機能を許可する
    updateViewportMetaTag();
    
    // 初期オフライン状態を設定
    setIsOffline(!navigator.onLine);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown as any);
      window.removeEventListener('keyup', handleKeyUp as any);
    };
  }, []);

  // オンライン/オフライン状態検出
  useEffect(() => {
    const handleOnline = async () => {
      console.log("オンライン状態に復帰");
      setIsOffline(false);
      
      // 未同期データがあれば同期フラグを立てる
      if (attendanceData.length > 0 || scheduleData.length > 0) {
        setPendingChanges(true);
        showToast("オンラインに戻りました。同期ボタンからデータを同期できます", "info");
        
        // 自動同期オプション（必要に応じて有効化）
        // if (true) { // 自動同期を有効にする場合はこのコメントを解除
        //   await syncChanges();
        // }
      }
    };
    
    const handleOffline = () => {
      console.log("オフライン状態に切り替わりました");
      setIsOffline(true);
      // オフライン時は同期フラグを下げる
      setPendingChanges(false);
      showToast("オフライン状態になりました。データはローカルに保存されます", "warning");
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [attendanceData.length, scheduleData.length]);

  // 管理者モード変更時の一括編集モード初期化
  useEffect(() => {
    if (!isAdminMode) {
      setIsBulkEditMode(false);
      setSelectedCells([]);
      setIsMobileSelectMode(false);
    }
    
    // 管理者モードの切り替え後、少し遅延させてからスクロール位置を復元
    if (currentView === "table" && tableContainerGlobalRef.current) {
      const timer = setTimeout(() => {
        if (tableContainerGlobalRef.current) {
          tableContainerGlobalRef.current.scrollLeft = globalScrollPosition.x;
          tableContainerGlobalRef.current.scrollTop = globalScrollPosition.y;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isAdminMode, currentView, globalScrollPosition]);

  // 状態変更時のLocalStorage保存
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_VIEW, JSON.stringify(currentView));
      StorageService.saveData(STORAGE_KEYS.CURRENT_VIEW, currentView);
    } catch (e) {
      console.error("Failed to save current view:", e);
    }
  }, [currentView]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_DATE, JSON.stringify(currentDate.toISOString()));
      StorageService.saveData(STORAGE_KEYS.CURRENT_DATE, currentDate.toISOString());
    } catch (e) {
      console.error("Failed to save current date:", e);
    }
  }, [currentDate]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_EMPLOYEE, JSON.stringify(selectedEmployee));
      StorageService.saveData(STORAGE_KEYS.SELECTED_EMPLOYEE, selectedEmployee);
      
      // 従業員が選択されたら、singleEmployeeCalendar ビューに切り替える
      if (selectedEmployee && currentView === "table") {
        setCurrentView("singleEmployeeCalendar");
      } else if (!selectedEmployee && currentView === "singleEmployeeCalendar") {
        setCurrentView("table");
      }
    } catch (e) {
      console.error("Failed to save selected employee:", e);
    }
  }, [selectedEmployee, currentView]);

  // AttendanceDataが変更されたときにローカルストレージに保存
  useEffect(() => {
    if (attendanceData.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE_DATA, JSON.stringify(attendanceData));
        
        // オンライン状態の場合のみFirebaseへの同期フラグを立てる
        if (navigator.onLine) {
          setPendingChanges(true);
        }
      } catch (e) {
        console.error("Failed to save attendance data to localStorage:", e);
      }
    }
  }, [attendanceData]);

  // ScheduleDataが変更されたときにローカルストレージに保存
  useEffect(() => {
    if (scheduleData.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEYS.SCHEDULE_DATA, JSON.stringify(scheduleData));
        
        // オンライン状態の場合のみFirebaseへの同期フラグを立てる
        if (navigator.onLine) {
          setPendingChanges(true);
        }
      } catch (e) {
        console.error("Failed to save schedule data to localStorage:", e);
      }
    }
  }, [scheduleData]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ADMIN_MODE, JSON.stringify(isAdminMode));
      StorageService.saveData(STORAGE_KEYS.ADMIN_MODE, isAdminMode);
    } catch (e) {
      console.error("Failed to save admin mode:", e);
    }
  }, [isAdminMode]);

  // ストレージ使用状況の確認
  useEffect(() => {
    // 管理者モードがオンになった時に使用状況を確認
    if (isAdminMode) {
      const warning = StorageService.checkStorageWarning(70);
      if (warning) {
        showToast(warning, "warning");
      }
      
      // Firebase使用状況を更新
      if (navigator.onLine) {
        StorageService.getFirebaseStorageInfo().then(info => {
          if (info) {
            setFirebaseStorageInfo(info);
          }
        }).catch(error => {
          console.error("Error updating Firebase storage info:", error);
        });
      }
    }
  }, [isAdminMode]);

  // トースト通知の自動非表示
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast({ ...toast, show: false });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

// デバッグツールの初期化
useEffect(() => {
  // デバッグツールの初期化（開発環境のみ）
  if (process.env.NODE_ENV === 'development') {
    (window as any).appDebugTools = {
      // ストレージの状態を確認
      checkStorage: async () => {
        console.group('ストレージ診断');
        
        // ローカルストレージ
        try {
          const lsAttendance = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_DATA);
          const lsSchedule = localStorage.getItem(STORAGE_KEYS.SCHEDULE_DATA);
          console.log('LocalStorage - 勤怠データ:', lsAttendance ? JSON.parse(lsAttendance).length : 0, '件');
          console.log('LocalStorage - 予定データ:', lsSchedule ? JSON.parse(lsSchedule).length : 0, '件');
        } catch (e) {
          console.error('LocalStorage診断エラー:', e);
        }
        
        // IndexedDB
        try {
          const idbAttendance = await IndexedDBService.getAttendanceData();
          const idbSchedule = await IndexedDBService.getScheduleData();
          console.log('IndexedDB - 勤怠データ:', idbAttendance.length, '件');
          console.log('IndexedDB - 予定データ:', idbSchedule.length, '件');
        } catch (e) {
          console.error('IndexedDB診断エラー:', e);
        }
        
        // Reactステート
        console.log('React状態 - 勤怠データ:', attendanceData.length, '件');
        console.log('React状態 - 予定データ:', scheduleData.length, '件');
        
        console.groupEnd();
      },
      
      // データをリセット
      resetData: async () => {
        if (confirm('本当にすべてのデータをリセットしますか？')) {
          try {
            await StorageService.resetAllData();
            setAttendanceData([]);
            setScheduleData([]);
            console.log('✓ データをリセットしました');
            return true;
          } catch (e) {
            console.error('データリセットエラー:', e);
            return false;
          }
        }
      },
      
      // ストレージ健全性チェック
      checkStorageHealth: async () => {
        const health = await StorageService.checkStorageHealth();
        console.log('ストレージ健全性:', health);
        return health;
      },
      
      // 状態変数確認
      getState: () => {
        return {
          currentView,
          currentDate: currentDate.toISOString(),
          selectedEmployee,
          isAdminMode,
          isOffline,
          pendingChanges,
          attendanceCount: attendanceData.length,
          scheduleCount: scheduleData.length
        };
      }
    };
    
    console.log('デバッグツールが利用可能: window.appDebugTools');
  }
}, []);

  //---------------------------------------------------------------
  // ヘルパー関数
  //---------------------------------------------------------------
  // 勤務区分の表示順にソートする関数
  const sortWorkTypeSummary = (summary: DailySummary) => {
    return Object.entries(summary).sort((a: [string, number], b: [string, number]) => {
      const indexA = WORK_TYPE_DISPLAY_ORDER.indexOf(a[0]);
      const indexB = WORK_TYPE_DISPLAY_ORDER.indexOf(b[0]);
      
      // 表示順リストにある場合はその順序を使用
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      // どちらか一方だけリストにある場合は、リストにある方を優先
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // どちらもリストにない場合はアルファベット順
      return a[0].localeCompare(b[0]);
    });
  };

  // ビューポートメタタグを更新
  const updateViewportMetaTag = () => {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes');
    } else {
      const newViewportMeta = document.createElement('meta');
      newViewportMeta.name = 'viewport';
      newViewportMeta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes';
      document.getElementsByTagName('head')[0].appendChild(newViewportMeta);
    }
  };
  
  // テーブルのスクロール位置を取得して保存
  const captureTableScroll = () => {
    if (tableContainerGlobalRef.current && currentView === "table") {
      setGlobalScrollPosition({
        x: tableContainerGlobalRef.current.scrollLeft,
        y: tableContainerGlobalRef.current.scrollTop
      });
    }
  };

  // 特定従業員の勤務区分スコアを計算する関数
  const calculateEmployeeWorkTypeScore = (employeeId: number) => {
    let score = 0;
    
    const yearMonth = format(currentDate, "yyyy-MM");
    
    attendanceData.forEach(record => {
      if (record.employeeId === employeeId.toString() && record.date.startsWith(yearMonth)) {
        if (record.workType === '休') {
          // 日付文字列から Date オブジェクトを作成
          const recordDate = new Date(record.date);
          // 土曜日の場合は0.5点、それ以外の日は1.0点
          if (isSaturday(recordDate)) {
            score += 0.5;
          } else {
            score += 1.0;
          }
        } else if (record.workType === 'A' || record.workType === 'P') {
          score += 0.5;
        }
      }
    });
    
    return score;
  };

// 変更データの同期 - 改善版
const syncChanges = async () => {
  try {
    console.log("同期処理を開始しました");
    
    // 同期開始時にプログレスバーを表示
    setSyncProgress({ show: true, progress: 0, stage: '同期準備中...' });
    
    // スクロール位置の保存
    captureTableScroll();
    
    // オフライン状態チェック
    if (isOffline || !navigator.onLine) {
      console.log("オフライン状態のため同期できません");
      showToast("オフライン状態のため同期できません。データはローカルに保存されています", "warning");
      setSyncProgress({ show: false, progress: 0, stage: '' });
      return false;
    }
    
    // このタイミングで Firebase にデータを送信
    let syncSuccess = false;
    try {
      // 進捗状況更新用コールバック
      const progressCallback = (stage: string, progress: number) => {
        setSyncProgress({ show: true, progress: progress, stage: stage });
      };
      
      // 勤怠データの同期 (0-50%)
      setSyncProgress({ show: true, progress: 5, stage: '勤怠データを同期中...' });
      const attendanceSuccess = await StorageService.saveData(
        STORAGE_KEYS.ATTENDANCE_DATA, 
        attendanceData,
        (stage, progress) => progressCallback(`勤怠データ: ${stage}`, progress * 0.5)
      );
      
      // 予定データの同期 (50-100%)
      setSyncProgress({ show: true, progress: 50, stage: '予定データを同期中...' });
      const scheduleSuccess = await StorageService.saveData(
        STORAGE_KEYS.SCHEDULE_DATA, 
        scheduleData,
        (stage, progress) => progressCallback(`予定データ: ${stage}`, 50 + progress * 0.5)
      );
      
      syncSuccess = attendanceSuccess && scheduleSuccess;
    } catch (e) {
      console.error('Firebaseとの同期エラー:', e);
      showToast("クラウドとの同期に失敗しましたが、データはローカルに保存されています", "warning");
      setSyncProgress({ show: false, progress: 0, stage: '' });
      return false;
    }
    
    // 同期が成功したらフラグを下げる
    if (syncSuccess) {
      setPendingChanges(false);
      setSyncProgress({ show: true, progress: 100, stage: '同期完了!' });
      
      // 完了メッセージを表示して、少し待ってからプログレスバーを非表示
      setTimeout(() => {
        setSyncProgress({ show: false, progress: 0, stage: '' });
        showToast("データを同期しました", "success");
      }, 1000);
      
      // Firebase使用状況を更新
      if (isAdminMode) {
        try {
          const info = await StorageService.getFirebaseStorageInfo();
          if (info) {
            setFirebaseStorageInfo(info);
          }
        } catch (e) {
          console.error('Firebase使用状況の更新に失敗:', e);
        }
      }
    } else {
      setSyncProgress({ show: false, progress: 0, stage: '' });
      showToast("同期に問題が発生しました。後でもう一度お試しください", "warning");
    }
    
    // スクロール位置を復元
    try {
      const savedPos = JSON.parse(localStorage.getItem('_sync_button_click_pos') || '{}');
      if (savedPos.time && Date.now() - savedPos.time < 30000) {
        window.scrollTo(savedPos.x, savedPos.y);
        
        // テーブルのスクロール位置も復元（少し遅延させる）
        setTimeout(() => {
          if (tableContainerGlobalRef.current) {
            tableContainerGlobalRef.current.scrollLeft = globalScrollPosition.x;
            tableContainerGlobalRef.current.scrollTop = globalScrollPosition.y;
          }
        }, 50);
      }
    } catch (e) {
      console.error('スクロール位置の復元に失敗:', e);
    }
    
    console.log("同期処理が完了しました");
    return syncSuccess;
  } catch (error) {
    console.error("同期処理エラー:", error);
    showToast("データの同期に失敗しました", "error");
    setSyncProgress({ show: false, progress: 0, stage: '' });
    return false;
  }
};

  // カレンダー日付生成
  const generateCalendarDates = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dates = [];

    // 前月の日付を追加
    for (let i = 0; i < firstDay.getDay(); i++) {
      const prevDate = new Date(year, month, -i);
      dates.unshift({ date: prevDate, isCurrentMonth: false });
    }

    // 当月の日付を追加
    for (let i = 1; i <= lastDay.getDate(); i++) {
      dates.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // 翌月の日付を追加（6週間分になるように）
    const remainingDays = 42 - dates.length;
    for (let i = 1; i <= remainingDays; i++) {
      dates.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return dates;
  };

  // 日次集計を計算
  const calculateDailySummary = (date: Date): DailySummary => {
    const dateStr = format(date, "yyyy-MM-dd");
    const records = attendanceData.filter((record) => {
      // 除外対象の従業員は集計に含めない
      if (EXCLUDED_EMPLOYEE_IDS.includes(Number(record.employeeId))) {
        return false;
      }
      return record.date === dateStr;
    });

    return records.reduce((acc, record) => {
      acc[record.workType] = (acc[record.workType] || 0) + 1;
      return acc;
    }, {} as DailySummary);
  };

  // 特定の日付の予定を取得
  const getScheduleForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return scheduleData.filter(schedule => schedule.date === dateStr);
  };

  // 特定の従業員と日付の予定を取得
  const getEmployeeScheduleForDate = (employeeId: number, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return scheduleData.filter(
      schedule => 
        schedule.date === dateStr && 
        (schedule.employeeId === "" || // 後方互換性のため
         schedule.employeeId === employeeId.toString() || 
         (schedule.employeeIds && 
          (schedule.employeeIds.includes(employeeId.toString()) || 
           schedule.employeeIds.length === 0)) // 空配列は全員向け
        )
    );
  };

  // 特定の従業員と日付の勤務区分を取得
  const getEmployeeWorkTypeForDate = (employeeId: number, date: Date): string | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    const record = attendanceData.find(
      record => record.employeeId === employeeId.toString() && record.date === dateStr
    );
    
    return record ? record.workType : null;
  };
  
  // 平日（月〜金）かどうかを判定する関数
  const isWeekday = (date: Date): boolean => {
    const day = date.getDay();
    return day >= 1 && day <= 5; // 月曜日(1)から金曜日(5)まで
  };
  
  // 土曜日かどうかを判定する関数
  const isSaturday = (date: Date): boolean => {
    return date.getDay() === 6; // 土曜日(6)
  };

  // 条件1の勤務区分リスト
  const WARNING_WORK_TYPES_CONDITION1 = [
    "休", "A", "P", "年", "a", "p", "Ap", "Fビ", "a1/P", "a2/P", "a3/P", "A/p1", "A/p3"
  ];

  // 条件2の勤務区分リスト
  const WARNING_WORK_TYPES_CONDITION2 = ["A", "P", "a", "p"];
  
  // 条件3の勤務区分リスト (土曜日用 - 条件1と同じリストを使用)
  const WARNING_WORK_TYPES_CONDITION3 = WARNING_WORK_TYPES_CONDITION1;

// 特定の勤務区分の合計人数をカウントする関数
const countSpecificWorkTypes = (date: Date, workTypeList: string[]): number => {
  const dateStr = format(date, "yyyy-MM-dd");
  const records = attendanceData.filter(
    record => {
      // 除外対象の従業員はカウントしない
      if (EXCLUDED_EMPLOYEE_IDS.includes(Number(record.employeeId))) {
        return false;
      }
      return record.date === dateStr && workTypeList.includes(record.workType);
    }
  );
  return records.length;
};

// 指定した週に祝日があるかどうかを判定する関数
const hasHolidayInWeek = (date: Date): boolean => {
  // 週の開始日（日曜日）
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  
  // 週の終了日（土曜日）
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  
  // 週内の各日をチェック
  let currentDate = new Date(startOfWeek);
  while (currentDate <= endOfWeek) {
    if (isJapaneseHoliday(currentDate)) {
      return true;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return false;
};

// 条件1: 平日で特定の勤務区分の合計が8人以上
const checkCondition1 = (date: Date): boolean => {
  if (!isWeekday(date)) {
    return false;
  }
  
  const count = countSpecificWorkTypes(date, WARNING_WORK_TYPES_CONDITION1);
  return count >= 8;
};

// 条件2: 祝日のある週の平日で特定の勤務区分の合計が4人以上
const checkCondition2 = (date: Date): boolean => {
  if (!isWeekday(date) || !hasHolidayInWeek(date)) {
    return false;
  }
  
  const count = countSpecificWorkTypes(date, WARNING_WORK_TYPES_CONDITION2);
  return count >= 4;
};

// 条件3: 土曜日で特定の勤務区分の合計が6人以上
const checkCondition3 = (date: Date): boolean => {
  if (!isSaturday(date)) {
    return false;
  }
  
  const count = countSpecificWorkTypes(date, WARNING_WORK_TYPES_CONDITION3);
  return count >= 6;
};

// 警告表示が必要かどうかを判定する総合関数
const shouldShowWarning = (date: Date): boolean => {
  return checkCondition1(date) || checkCondition2(date) || checkCondition3(date);
};

// トースト通知を表示
const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "info") => {
  setToast({
    show: true,
    message,
    type: type as any,
  });
};

// 確認モーダルを表示
const showConfirm = (message: string, action: () => void) => {
  setConfirmModalMessage(message);
  setConfirmModalAction(() => action);
  setShowConfirmModal(true);
};

// 成功モーダルを表示
const showSuccess = (message: string) => {
  setSuccessMessage(message);
  setShowSuccessModal(true);
};

// ストレージ使用状況を表示する関数
const showStorageUsage = () => {
  const usage = StorageService.getStorageUsage();
  setStorageUsageData(usage);
  setShowStorageUsageModal(true);
};

// セルの選択・非選択を切り替える
const toggleCellSelection = (employeeId: number, date: Date, ctrlKey: boolean = false) => {
  if (!isBulkEditMode || !isAdminMode) return;
  
  const cellIndex = selectedCells.findIndex(
    cell => cell.employeeId === employeeId && cell.date.getTime() === date.getTime()
  );
  
  if (cellIndex !== -1) {
    // すでに選択されている場合は削除
    setSelectedCells(prev => prev.filter((_, i) => i !== cellIndex));
  } else {
    // 選択されていない場合は追加
    // Ctrlキーまたはモバイル選択モードが有効でない場合は選択をクリア
    if (!ctrlKey && !isMobileSelectMode && selectedCells.length > 0) {
      setSelectedCells([{ employeeId, date }]);
    } else {
      setSelectedCells(prev => [...prev, { employeeId, date }]);
    }
  }
};

// セルが選択されているかを確認
const isCellSelected = (employeeId: number, date: Date) => {
  return selectedCells.some(
    cell => cell.employeeId === employeeId && cell.date.getTime() === date.getTime()
  );
};

// 全セルを選択
const selectAllCellsForEmployee = (employeeId: number) => {
  if (!isBulkEditMode || !isAdminMode) return;
  
  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();
  
  const dates = Array.from({ length: daysInMonth }, (_, i) => 
    new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)
  );
  
  const newSelectedCells = dates.map(date => ({
    employeeId,
    date
  }));
  
  setSelectedCells(newSelectedCells);
};

// 従業員の全セルの選択を解除
const clearSelectionForEmployee = (employeeId: number) => {
  if (!isBulkEditMode || !isAdminMode) return;
  
  setSelectedCells(prev => 
    prev.filter(cell => cell.employeeId !== employeeId)
  );
};

// 勤務区分を登録・更新
const updateAttendanceRecord = async (employeeId: number, date: Date, workType: string) => {
  try {
    // 同期開始を表示
    setSyncProgress({ show: true, progress: 0, stage: '勤務データ更新中...' });
    
    const dateStr = format(date, "yyyy-MM-dd");
    const employeeName = employees.find(emp => emp.id === employeeId)?.name;
    
    // 既存データを除外
    const newAttendanceData = attendanceData.filter(
      record => !(record.employeeId === employeeId.toString() && record.date === dateStr)
    );
    
    // 新しいレコードの作成（workTypeが指定されている場合のみ）
    if (workType) {
      const newRecord: AttendanceRecord = {
        employeeId: employeeId.toString(),
        date: dateStr,
        workType,
        employeeName
      };
      newAttendanceData.push(newRecord);
    }
    
    // 状態を更新
    setAttendanceData(newAttendanceData);
    
    // 一貫したデータ保存フローを使用
    setSyncProgress({ show: true, progress: 20, stage: 'データをストレージに保存中...' });
    
    // StorageServiceを使って保存 (すべてのストレージに一貫して保存)
    const success = await StorageService.saveData(
      STORAGE_KEYS.ATTENDANCE_DATA, 
      newAttendanceData,
      (stage, progress) => {
        setSyncProgress({ 
          show: true, 
          progress: 20 + (progress * 0.8), 
          stage: `勤務データ: ${stage}` 
        });
      }
    );
    
    if (success) {
      // 成功時
      setSyncProgress({ show: true, progress: 100, stage: '更新完了!' });
      setTimeout(() => {
        setSyncProgress({ show: false, progress: 0, stage: '' });
      }, 1000);
      
      // オンライン時は自動同期済みなのでフラグを下げる
      if (navigator.onLine && !isOffline) {
        setPendingChanges(false);
      } else {
        setPendingChanges(true);
      }
    } else {
      // 失敗時
      setSyncProgress({ show: false, progress: 0, stage: '' });
      showToast("データの一部保存に失敗しました。同期ボタンで再同期してください", "warning");
      setPendingChanges(true);
    }
    
    return newAttendanceData;
  } catch (error) {
    console.error('勤務区分の更新に失敗しました:', error);
    showToast("勤務区分の更新に失敗しました", "error");
    setSyncProgress({ show: false, progress: 0, stage: '' });
    return attendanceData; // 変更せず元のデータを返す
  }
};

// 利用可能な月リストを生成（過去24ヶ月〜将来3ヶ月まで）
const getAvailableMonths = (): Date[] => {
  const months: Date[] = [];
  const now = new Date();
  
  // 過去24ヶ月
  for (let i = 24; i > 0; i--) {
    months.push(subMonths(startOfMonth(now), i));
  }
  
  // 現在の月
  months.push(startOfMonth(now));
  
  // 将来3ヶ月
  for (let i = 1; i <= 3; i++) {
    months.push(addMonths(startOfMonth(now), i));
  }
  
  return months;
};

// 月選択モーダルを表示
const showMonthSelection = (mode: "export" | "reset") => {
  setMonthSelectionMode(mode);
  setSelectedMonth(currentDate);
  setShowMonthSelectionModal(true);
};

// 「〇〇年〇月」形式で日付を表示
const formatMonthDisplay = (date: Date): string => {
  return format(date, "yyyy年M月");
};

// 特定の月に含まれるデータをフィルタリング
const filterDataByMonth = <T extends { date: string }>(data: T[], month: Date): T[] => {
  const year = month.getFullYear();
  const monthNum = month.getMonth();
  
  return data.filter(item => {
    const itemDate = new Date(item.date);
    return itemDate.getFullYear() === year && itemDate.getMonth() === monthNum;
  });
};
//---------------------------------------------------------------
// データ操作関数
//---------------------------------------------------------------
// 勤務データをエクスポート
const exportToExcel = (month: Date = currentDate) => {
  const monthStr = format(month, "yyyy-MM");
  const monthData = filterDataByMonth(attendanceData, month);
  
  const data = monthData.map((record) => ({
    従業員名: employees.find((emp) => emp.id.toString() === record.employeeId)?.name,
    日付: record.date,
    勤務区分: workTypes.find((w) => w.id === record.workType)?.label,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "勤務記録");
  XLSX.writeFile(wb, `勤務記録_${format(month, "yyyy年M月")}.xlsx`);
  
  showToast(`${format(month, "yyyy年M月")}の勤務データをエクスポートしました`, "success");
  setShowMonthSelectionModal(false);
};

// 全データリセット
const resetAllData = () => {
  showConfirm("全てのデータをリセットしますか？この操作は元に戻せません。", async () => {
    try {
      // まずローカルストレージをクリアして確実にデータを削除
      try {
        localStorage.removeItem(STORAGE_KEYS.ATTENDANCE_DATA);
        localStorage.removeItem(STORAGE_KEYS.SCHEDULE_DATA);
      } catch (e) {
        console.error('Failed to clear localStorage:', e);
      }
      
      // 状態を空に設定
      setAttendanceData([]);
      setScheduleData([]);
      
      // Firebase内のデータもリセット
      const success = await StorageService.resetAllData();
      if (success) {
        // オンラインなら同期処理を実行
        if (navigator.onLine) {
          await syncChanges();
        }
        
        showSuccess("全てのデータをリセットしました");
        
        // Firebase使用状況を更新
        if (navigator.onLine) {
          const info = await StorageService.getFirebaseStorageInfo();
          if (info) {
            setFirebaseStorageInfo(info);
          }
        }
      } else {
        showToast("クラウド上のデータのリセットに失敗しましたが、ローカルデータはクリアされました", "warning");
      }
    } catch (error) {
      console.error("Error resetting data:", error);
      showToast("データのリセットに失敗しました", "error");
    }
  });
};

// 月次データをリセット
const resetMonthData = (month: Date = currentDate) => {
  const targetMonth = format(month, "yyyy-MM");
  
  showConfirm(`${format(month, "yyyy年M月")}のデータのみをリセットしますか？この操作は元に戻せません。`, async () => {
    try {
      // まずローカルからデータを削除
      const newAttendanceData = attendanceData.filter(record => !record.date.startsWith(targetMonth));
      const newScheduleData = scheduleData.filter(schedule => !schedule.date.startsWith(targetMonth));
      
      // ローカルストレージに保存
      try {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE_DATA, JSON.stringify(newAttendanceData));
        localStorage.setItem(STORAGE_KEYS.SCHEDULE_DATA, JSON.stringify(newScheduleData));
      } catch (e) {
        console.error('Failed to save filtered data to localStorage:', e);
      }
      
      // 状態を更新
      setAttendanceData(newAttendanceData);
      setScheduleData(newScheduleData);
      
      // Firebase内のデータもリセット（オンラインの場合のみ）
      if (navigator.onLine) {
        const success = await StorageService.deleteMonthData(targetMonth);
        
        if (success) {
          // 同期処理を実行
          await syncChanges();
          
          // Firebase使用状況を更新
          const info = await StorageService.getFirebaseStorageInfo();
          if (info) {
            setFirebaseStorageInfo(info);
          }
        } else {
          showToast("クラウド上のデータの削除に失敗しましたが、ローカルデータは更新されました", "warning");
        }
      }
      
      showSuccess(`${format(month, "yyyy年M月")}のデータをリセットしました`);
      setShowMonthSelectionModal(false);
    } catch (error) {
      console.error("Error resetting month data:", error);
      showToast("データのリセットに失敗しました", "error");
    }
  });
};

// 予定の削除
// 予定の削除（改善版）
const deleteSchedule = (scheduleId: string) => {
  showConfirm("この予定を削除しますか？", async () => {
    try {
      console.log(`予定ID: ${scheduleId} の削除処理を開始します`);
      
      // 専用の削除メソッドを使用して全ストレージ層で削除
      const success = await StorageService.deleteScheduleItem(scheduleId);
      
      if (success) {
        // 削除が成功したら状態を更新
        const newScheduleData = scheduleData.filter(item => item.id !== scheduleId);
        setScheduleData(newScheduleData);
        setPendingChanges(false);
        showToast("予定を削除しました", "success");
        console.log(`予定ID: ${scheduleId} の削除が完了しました`);
      } else {
        // 削除失敗時
        if (navigator.onLine) {
          setPendingChanges(true);
          showToast("クラウドへの同期に失敗しました。後で再同期してください", "warning");
        } else {
          showToast("予定の削除に失敗しました", "error");
        }
      }
      
      // モーダルを閉じる
      setShowScheduleModal(false);
      setSelectedScheduleItem(null);
      
    } catch (error) {
      console.error('予定削除エラー:', error);
      showToast("予定の削除に失敗しました", "error");
    }
  });
};

//---------------------------------------------------------------
// サブコンポーネント
//---------------------------------------------------------------
// オフライン表示コンポーネント - インラインでは使わず、別ファイルのコンポーネントを使用
const OfflineIndicator: React.FC = () => {
  return <OfflineIndicatorComponent isOffline={isOffline} pendingChanges={pendingChanges} />;
};

// 同期プログレスバーコンポーネント
const SyncProgressBar: React.FC = () => {
  if (!syncProgress.show) return null;
  
  return (
    <div className="fixed inset-x-0 top-0 z-50">
      <div className="bg-white shadow-md p-2">
        <div className="text-sm text-center mb-1">{syncProgress.stage}</div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${syncProgress.progress}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

// TableViewコンポーネント
const TableView = React.memo(() => {
  // スクロール位置を保持するための参照を追加
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollMemory, setScrollMemory] = useState({ x: 0, y: 0, shouldRestore: false });

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();

  const dates = Array.from({ length: daysInMonth }, (_, i) => 
    new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)
  );

  // コンポーネントマウント時に参照を共有
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerGlobalRef.current = tableContainerRef.current;
    }
  }, []);

  // スクロール位置を記憶する関数
  const rememberScrollPosition = () => {
    if (tableContainerRef.current) {
      const newPosition = {
        x: tableContainerRef.current.scrollLeft,
        y: tableContainerRef.current.scrollTop,
        shouldRestore: true
      };
      setScrollMemory(newPosition);
      
      // グローバルスクロール位置も更新
      setGlobalScrollPosition({
        x: newPosition.x,
        y: newPosition.y
      });
      
      // 一時的にスクロール位置を localStorage にも保存
      try {
        localStorage.setItem('_temp_scroll_pos', JSON.stringify({
          table: { x: newPosition.x, y: newPosition.y },
          time: Date.now()
        }));
      } catch (e) {
        console.error('Failed to save scroll position to localStorage:', e);
      }
    }
  };

  // スクロール位置を復元するためのuseEffect
  useEffect(() => {
    if (scrollMemory.shouldRestore && tableContainerRef.current) {
      // 次のレンダリングサイクルで実行するために setTimeout を使用
      const timeoutId = setTimeout(() => {
        if (tableContainerRef.current) {
          tableContainerRef.current.scrollLeft = scrollMemory.x;
          tableContainerRef.current.scrollTop = scrollMemory.y;
        }
        // 復元完了フラグをリセット
        setScrollMemory(prev => ({ ...prev, shouldRestore: false }));
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [scrollMemory.shouldRestore, showWorkTypeModal, showScheduleModal]);
  
  // グローバルスクロール位置が変更された場合にも復元を試みる
  useEffect(() => {
    if (tableContainerRef.current && globalScrollPosition.x !== 0 && globalScrollPosition.y !== 0) {
      const timer = setTimeout(() => {
        if (tableContainerRef.current) {
          tableContainerRef.current.scrollLeft = globalScrollPosition.x;
          tableContainerRef.current.scrollTop = globalScrollPosition.y;
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [showWorkTypeModal, isAdminMode, isBulkEditMode]);

  // セル選択時のスクロール位置保持処理
  const handleCellClick = (e: React.MouseEvent, employeeId: number, date: Date) => {
    // スクロール位置を記憶
    rememberScrollPosition();
    
    // グローバルなスクロール位置も更新
    captureTableScroll();

    // 通常の選択処理
    if (isBulkEditMode && isAdminMode) {
      toggleCellSelection(employeeId, date, e.ctrlKey || isCtrlPressed);
    } else {
      setSelectedCell({ employeeId, date });
      setShowWorkTypeModal(true);
    }
  };
  
  // 同じ従業員の週区切りでセルを選択
  const selectWeekCells = (employeeId: number, startDate: Date) => {
    if (!isBulkEditMode || !isAdminMode) return;
    
    // スクロール位置を記憶
    rememberScrollPosition();
    
    // 週の開始日（日曜日）
    const startOfWeek = new Date(startDate);
    startOfWeek.setDate(startDate.getDate() - startDate.getDay());
    
    // 週の終了日（土曜日）
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    
    // 現在の月に含まれる週の日付を取得
    const weekDates = [];
    let currentDate = new Date(startOfWeek);
    
    while (currentDate <= endOfWeek) {
      // 当月の日付のみを対象にする
      if (currentDate.getMonth() === startDate.getMonth()) {
        weekDates.push(new Date(currentDate));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // 既存の選択に追加（複数選択モードが有効な場合）または置き換え
    if (isMobileSelectMode || isCtrlPressed) {
      const newSelections = weekDates.map(date => ({
        employeeId,
        date
      }));
      
      // 既に選択されているセルを除外
      const filteredNewSelections = newSelections.filter(
        newSel => !selectedCells.some(
          existSel => 
            existSel.employeeId === newSel.employeeId && 
            existSel.date.getTime() === newSel.date.getTime()
        )
      );
      
      setSelectedCells([...selectedCells, ...filteredNewSelections]);
    } else {
      setSelectedCells(weekDates.map(date => ({
        employeeId,
        date
      })));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex justify-between items-center flex-wrap gap-2">
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={selectedEmployee}
            onChange={(e) => {
              rememberScrollPosition();
              setSelectedEmployee(e.target.value);
            }}
            className="w-64 p-2 border rounded"
          >
            <option value="">全従業員を表示</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id.toString()}>
                {emp.name}
              </option>
            ))}
          </select>
          
          {isAdminMode && (
            <div className="flex items-center gap-2 ml-4 flex-wrap">
              <button
                onClick={() => {
                  rememberScrollPosition();
                  setIsBulkEditMode(!isBulkEditMode);
                  if (!isBulkEditMode) {
                    setSelectedCells([]);
                  }
                }}
                className={`px-3 py-1 rounded ${
                  isBulkEditMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                }`}
              >
                {isBulkEditMode ? '一括編集中' : '一括編集'}
              </button>
              
              {isBulkEditMode && (
                <>
                  <button
                    onClick={() => {
                      rememberScrollPosition();
                      setSelectedCells([]);
                    }}
                    className="px-3 py-1 rounded bg-gray-200"
                    disabled={selectedCells.length === 0}
                  >
                    選択解除 {selectedCells.length > 0 && `(${selectedCells.length})`}
                  </button>
                  
                  <button
                    onClick={() => {
                      rememberScrollPosition();
                      setIsMobileSelectMode(!isMobileSelectMode);
                    }}
                    className={`px-3 py-1 rounded ${
                      isMobileSelectMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                    } text-sm md:text-base`}
                  >
                    {isMobileSelectMode ? '複数選択モード：オン' : '複数選択モードに切り替え'}
                  </button>
                  
                  {selectedCells.length > 0 && (
                    <button
                      onClick={() => {
                        rememberScrollPosition();
                        setShowWorkTypeModal(true);
                      }}
                      className="px-3 py-1 rounded bg-blue-500 text-white"
                    >
                      勤務区分を適用
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        
        {isBulkEditMode && isAdminMode && (
          <div className="text-sm text-gray-600 mt-2 mb-2">
            <p>※ Ctrlキーを押しながらか複数選択モードで複数選択できます。</p>
            <p>※ 従業員名をクリックすると、その従業員の全日程を選択できます。</p>
          </div>
        )}
      </div>
      
      <div 
        ref={tableContainerRef}
        className="attendance-table-wrapper"
        style={{ overscrollBehavior: 'none' }}
      >
        <div className="attendance-table-container" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="border-collapse attendance-table">
            <thead>
              <tr>
                <th className="border p-2 min-w-[100px] max-w-[120px] sticky left-0 bg-white z-20">
                  従業員名
                </th>
                {dates.map(date => (
                  <th 
                    key={date.getTime()} 
                    className={`
                      border p-2 min-w-[80px] max-w-[90px]
                      ${getCellBackgroundColor(date).bg}
                      sticky top-0 z-10
                    `}
                  >
                    <div className={`${getCellBackgroundColor(date).text} text-base truncate`}>
                      {format(date, 'd')}
                      <span className="block text-xs">
                        {['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}
                        {isJapaneseHoliday(date) && (
                          <span className="block truncate text-xs">
                            {getHolidayName(date)}
                          </span>
                        )}
                      </span>
                    </div>
                    {/* 全従業員表示時は勤務人数と予定を非表示にする */}
                    {selectedEmployee && (
                      <div className="text-xs">
                        {Object.entries(calculateDailySummary(date)).map(([type, count]) => (
                          <div key={type} className="truncate">
                            {workTypes.find(w => w.id === type)?.label}: {count}
                          </div>
                        ))}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees
                .filter(emp => !selectedEmployee || emp.id.toString() === selectedEmployee)
                .map(employee => {
                  const selectedCount = selectedCells.filter(
                    cell => cell.employeeId === employee.id
                  ).length;
                  
                  return (
                    <tr key={employee.id}>
                      <td 
                        className={`
                          border p-2 whitespace-nowrap sticky left-0 bg-white z-10
                          ${isBulkEditMode && isAdminMode ? 'cursor-pointer hover:bg-gray-100' : ''}
                        `}
                        onClick={() => {
                          if (isBulkEditMode && isAdminMode) {
                            rememberScrollPosition();
                            if (selectedCount === dates.length) {
                              clearSelectionForEmployee(employee.id);
                            } else {
                              selectAllCellsForEmployee(employee.id);
                            }
                          }
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center">
                            <span>{employee.name}</span>
                            <span className="ml-2 text-sm font-semibold text-blue-600">
                              {calculateEmployeeWorkTypeScore(employee.id).toFixed(1)}
                            </span>
                          </div>
                          {isBulkEditMode && isAdminMode && selectedCount > 0 && (
                            <span className="text-xs bg-blue-100 px-1 rounded">
                              {selectedCount}
                            </span>
                          )}
                        </div>
                      </td>
                      {dates.map(date => {
                        const record = attendanceData.find(
                          r => r.employeeId === employee.id.toString() &&
                          r.date === format(date, 'yyyy-MM-dd')
                        );
                        
                        const schedules = getEmployeeScheduleForDate(employee.id, date);
                        const isSelected = isCellSelected(employee.id, date);
                        
                        return (
                          <td
                            key={`${employee.id}-${date.getTime()}`}
                            className={`
                              border p-2 cursor-pointer text-center relative
                              ${getCellBackgroundColor(date).bg}
                              ${getCellBackgroundColor(date).hover}
                              ${isBulkEditMode && isAdminMode && isSelected ? 'bg-blue-100 border-2 border-blue-500' : ''}
                            `}
                            onClick={(e) => handleCellClick(e, employee.id, date)}
                            onDoubleClick={() => {
                              if (isBulkEditMode && isAdminMode) {
                                selectWeekCells(employee.id, date);
                              }
                            }}
                          >
                            <div className="min-h-[40px] flex flex-col items-center justify-center">
                              <div className="font-medium">
                                {record && workTypes.find(w => w.id === record.workType)?.label}
                              </div>
                              
                              {schedules.length > 0 && (
                                <div className="w-full mt-1">
                                  {schedules.slice(0, 2).map(schedule => (
                                    <div 
                                      key={schedule.id}
                                      className="text-xs px-1 py-0.5 rounded truncate text-white"
                                      style={{ backgroundColor: schedule.color || '#4A90E2' }}
                                      title={schedule.title}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        rememberScrollPosition();
                                        setSelectedScheduleDate(date);
                                        setSelectedScheduleItem(schedule);
                                        setShowScheduleModal(true);
                                      }}
                                    >
                                      {schedule.title}
                                    </div>
                                  ))}
                                  {schedules.length > 2 && (
                                    <div className="text-xs text-gray-500 truncate">
                                      +{schedules.length - 2}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

// CalendarViewコンポーネント
const CalendarView = React.memo(() => {
  return (
    <div className="p-4">
      <div className="calendar-grid">
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
          <div key={day} className="calendar-header">
            {day}
          </div>
        ))}
        {generateCalendarDates(
          currentDate.getFullYear(),
          currentDate.getMonth()
        ).map(({ date, isCurrentMonth }) => {
          const dailySummary = calculateDailySummary(date);
          const schedules = getScheduleForDate(date);
          
          return (
            <div
              key={date.toISOString()}
              className={`calendar-cell ${
                isCurrentMonth
                  ? "calendar-cell-current"
                  : "calendar-cell-other"
              } ${getCellBackgroundColor(date).text} ${
                isCurrentMonth && shouldShowWarning(date) ? "bg-warning-red" : ""
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="font-bold">
                    {date.getDate()}
                    {isJapaneseHoliday(date) && (
                      <span className="ml-1 text-xs truncate hidden md:inline">{getHolidayName(date)}</span>
                    )}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedScheduleDate(date);
                      setSelectedScheduleItem(null);
                      setShowScheduleModal(true);
                    }}
                    className="text-gray-500 hover:text-blue-500 p-1"
                    title="予定を追加"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
                
                {/* 祝日名（スマホ用） */}
                {isJapaneseHoliday(date) && (
                  <div className="text-xs text-red-500 truncate md:hidden">
                    {getHolidayName(date)}
                  </div>
                )}
                
                {/* 勤務区分の集計 - 表示順を指定順に変更 */}
                <div className="text-xs space-y-1 mt-1">
                  {sortWorkTypeSummary(dailySummary).map(([type, count]) => {
                    const workTypeLabel =
                      workTypes.find((w) => w.id === type)?.label || type;
                    return (
                      <div
                        key={type}
                        className="bg-gray-50 p-1 rounded text-gray-600"
                      >
                        {workTypeLabel}: {count}名
                      </div>
                    );
                  })}
                </div>
                
                {/* 予定の表示 */}
                <div className="text-xs space-y-1 mt-2">
                  {schedules.map((schedule) => {
                    // 従業員名のテキスト生成
                    let employeeText = "全員";
                    
                    if (schedule.employeeIds && schedule.employeeIds.length > 0) {
                      // 新形式のデータ
                      if (schedule.employeeIds.length === 1) {
                        // 1人だけの場合
                        const emp = employees.find(e => e.id.toString() === schedule.employeeIds[0]);
                        employeeText = emp ? emp.name : "不明";
                      } else {
                        // 複数人の場合
                        employeeText = `${schedule.employeeIds.length}人の従業員`;
                      }
                    } else if (schedule.employeeId && schedule.employeeId !== "") {
                      // 旧形式のデータ（個人指定）
                      const emp = employees.find(e => e.id.toString() === schedule.employeeId);
                      employeeText = emp ? emp.name : "不明";
                    }
                    
                    return (
                      <div
                        key={schedule.id}
                        className="p-1 rounded text-white truncate cursor-pointer"
                        style={{ backgroundColor: schedule.color || '#4A90E2' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedScheduleDate(date);
                          setSelectedScheduleItem(schedule);
                          setShowScheduleModal(true);
                        }}
                        title={`${schedule.title}${schedule.details ? ` - ${schedule.details}` : ''} (${employeeText})`}
                      >
                        {schedule.title}
                      </div>
                    );
                  })}
                </div>
                
                {/* 勤務詳細を見るためのクリックイベント */}
                <div 
                  className="absolute inset-0 cursor-pointer"
                  onClick={() => {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const records = attendanceData.filter(
                      (record) => record.date === dateStr
                    );
                    setSelectedDateDetails({ date, records });
                    setShowAttendanceDetailModal(true);
                  }}
                ></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });
  
  // 単一従業員カレンダービュー
  const SingleEmployeeCalendarView = React.memo(() => {
    // スクロール位置のための状態を追加
    const [scrollPosition, setScrollPosition] = useState({ x: 0, y: 0 });
    const calendarContainerRef = useRef<HTMLDivElement>(null);

    // スクロール位置を記憶する関数
    const rememberScrollPosition = () => {
      if (calendarContainerRef.current) {
        setScrollPosition({
          x: window.scrollX,
          y: window.scrollY
        });
      }
    };

    // スクロール位置を復元する
    useEffect(() => {
      if (scrollPosition.x !== 0 || scrollPosition.y !== 0) {
        setTimeout(() => {
          window.scrollTo(scrollPosition.x, scrollPosition.y);
        }, 0);
      }
    }, [showWorkTypeModal, showScheduleModal, scrollPosition]);

    if (!selectedEmployee) return null;
    
    const employeeId = parseInt(selectedEmployee);
    const employeeName = employees.find(emp => emp.id === employeeId)?.name || "従業員";
    
    return (
      <div className="p-4" ref={calendarContainerRef}>
        <div className="mb-4 flex gap-2 items-center">
          <select
            value={selectedEmployee}
            onChange={(e) => {
              rememberScrollPosition();
              setSelectedEmployee(e.target.value);
            }}
            className="w-64 p-2 border rounded"
          >
            <option value="">全従業員を表示</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id.toString()}>
                {emp.name}
              </option>
            ))}
          </select>
          
          {isAdminMode && (
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => {
                  rememberScrollPosition();
                  setIsBulkEditMode(!isBulkEditMode);
                  if (!isBulkEditMode) {
                    setSelectedCells([]);
                  }
                }}
                className={`px-3 py-1 rounded ${
                  isBulkEditMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                }`}
              >
                {isBulkEditMode ? '一括編集中' : '一括編集'}
              </button>
              
              {isBulkEditMode && (
                <>
                  <button
                    onClick={() => {
                      rememberScrollPosition();
                      setSelectedCells([]);
                    }}
                    className="px-3 py-1 rounded bg-gray-200"
                    disabled={selectedCells.length === 0}
                  >
                    選択解除 {selectedCells.length > 0 && `(${selectedCells.length})`}
                  </button>
                  
                  <button
                    onClick={() => {
                      rememberScrollPosition();
                      setIsMobileSelectMode(!isMobileSelectMode);
                    }}
                    className={`px-3 py-1 rounded ${
                      isMobileSelectMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                    } text-sm md:text-base`}
                  >
                    {isMobileSelectMode ? '複数選択モード：オン' : '複数選択モードに切り替え'}
                  </button>
                  
                  {selectedCells.length > 0 && (
                    <button
                      onClick={() => {
                        rememberScrollPosition();
                        setShowWorkTypeModal(true);
                      }}
                      className="px-3 py-1 rounded bg-blue-500 text-white"
                    >
                      勤務区分を適用
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        
        {isBulkEditMode && isAdminMode && (
          <div className="text-sm text-gray-600 mt-2 mb-2">
            <p>※ Ctrlキーを押しながらクリックで複数選択できます。</p>
            <p>※ 複数選択モードをオンにすると連続選択が可能になります。</p>
          </div>
        )}
        
        <div className="calendar-grid">
          {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
            <div key={day} className="calendar-header">
              {day}
            </div>
          ))}
          {generateCalendarDates(
            currentDate.getFullYear(),
            currentDate.getMonth()
          ).map(({ date, isCurrentMonth }) => {
            const workType = getEmployeeWorkTypeForDate(employeeId, date);
            const workTypeLabel = workType ? workTypes.find(w => w.id === workType)?.label : null;
            const schedules = getEmployeeScheduleForDate(employeeId, date);
            const isSelected = isCellSelected(employeeId, date);
            
            return (
              <div
                key={date.toISOString()}
                className={`calendar-cell ${
                  isCurrentMonth
                    ? "calendar-cell-current"
                    : "calendar-cell-other"
                } ${getCellBackgroundColor(date).text} cursor-pointer ${
                  isBulkEditMode && isAdminMode && isSelected ? 'bg-blue-100 border-2 border-blue-500' : ''
                } ${
                  isCurrentMonth && shouldShowWarning(date) ? "bg-warning-red" : ""
                }`}
                onClick={(e) => {
                  if (isCurrentMonth) {
                    rememberScrollPosition();
                    if (isBulkEditMode && isAdminMode) {
                      toggleCellSelection(employeeId, date, e.ctrlKey || isCtrlPressed);
                    } else {
                      setSelectedCell({ employeeId, date });
                      setShowWorkTypeModal(true);
                    }
                  }
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="font-bold">
                    {date.getDate()}
                  </div>
                  <div className="text-xs">
                    {['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}
                  </div>
                </div>
                
                {/* 祝日名（スマホでも表示） */}
                {isJapaneseHoliday(date) && (
                  <div className="text-xs text-red-500 truncate">
                    {getHolidayName(date)}
                  </div>
                )}
                
                {/* 勤務区分の表示 */}
                {isCurrentMonth && (
                  <div className="mt-2 mb-2 flex items-center justify-center min-h-[40px]">
                    {workType && (
                      <div className="text-xl font-bold p-2 bg-blue-50 rounded text-blue-800 w-full text-center">
                        {workTypeLabel}
                      </div>
                    )}
                  </div>
                )}
                
                {/* 予定の表示 */}
                {schedules.length > 0 && (
                  <div className="text-xs space-y-1 mt-2">
                    {schedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="p-1 rounded text-white truncate cursor-pointer"
                        style={{ backgroundColor: schedule.color || '#4A90E2' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          rememberScrollPosition();
                          setSelectedScheduleDate(date);
                          setSelectedScheduleItem(schedule);
                          setShowScheduleModal(true);
                        }}
                        title={schedule.title}
                      >
                        {schedule.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  });
  //---------------------------------------------------------------
  // モーダルコンポーネント
  //---------------------------------------------------------------
  // 勤務登録モーダル
  const WorkTypeSelectionModal = () => {
    const [selectedWorkType, setSelectedWorkType] = useState("");

    useEffect(() => {
      if (showWorkTypeModal && selectedCell) {
        // 既存の勤務データがあれば選択状態にする
        const dateStr = format(selectedCell.date, "yyyy-MM-dd");
        const existingRecord = attendanceData.find(
          record => record.employeeId === selectedCell.employeeId.toString() && record.date === dateStr
        );
        
        if (existingRecord) {
          setSelectedWorkType(existingRecord.workType);
        } else {
          setSelectedWorkType("");
        }
      } else if (showWorkTypeModal && selectedCells.length > 0 && isBulkEditMode) {
        // 一括編集モードの場合は空欄からスタート
        setSelectedWorkType("");
      }
      
      // モーダル表示時にスクロール位置を記録
      if (showWorkTypeModal) {
        try {
          localStorage.setItem('_modal_scroll_pos', JSON.stringify({
            x: window.scrollX,
            y: window.scrollY,
            table: globalScrollPosition,
            time: Date.now()
          }));
        } catch (e) {
          console.error('Failed to save scroll position for modal', e);
        }
      }
    }, [showWorkTypeModal, selectedCell, selectedCells, isBulkEditMode, attendanceData, globalScrollPosition]);
    
    // モーダルが閉じられた後のスクロール位置復元
    useEffect(() => {
      if (!showWorkTypeModal) {
        const timer = setTimeout(() => {
          try {
            // スクロール位置の復元を試みる
            const savedPos = JSON.parse(localStorage.getItem('_modal_scroll_pos') || '{}');
            if (savedPos.time && Date.now() - savedPos.time < 60000) {
              if (tableContainerGlobalRef.current && savedPos.table) {
                tableContainerGlobalRef.current.scrollLeft = savedPos.table.x;
                tableContainerGlobalRef.current.scrollTop = savedPos.table.y;
              }
            }
          } catch (e) {
            console.error('Failed to restore modal scroll position', e);
          }
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [showWorkTypeModal]);

    const handleSubmit = async () => {
      // 一括編集モードの場合
      if (isBulkEditMode && isAdminMode && selectedCells.length > 0) {
        if (!selectedWorkType) return;
        
        // まずモーダルを閉じる - これが重要な変更
        const cellsCount = selectedCells.length;
        const cellsCopy = [...selectedCells];
        const workTypeCopy = selectedWorkType;
        
        setShowWorkTypeModal(false);
        setSelectedCells([]);
        setSelectedWorkType("");
        
        try {
          const newAttendanceData = [...attendanceData];
          
          // コピーした配列を使用
          cellsCopy.forEach(cell => {
            const dateStr = format(cell.date, "yyyy-MM-dd");
            
            // 既存のレコードを除外
            const recordIndex = newAttendanceData.findIndex(
              record => record.employeeId === cell.employeeId.toString() && record.date === dateStr
            );
            
            if (recordIndex !== -1) {
              newAttendanceData.splice(recordIndex, 1);
            }
            
            // 新しいレコードを追加
            const newRecord: AttendanceRecord = {
              employeeId: cell.employeeId.toString(),
              date: dateStr,
              workType: workTypeCopy,
              employeeName: employees.find(emp => emp.id === cell.employeeId)?.name,
            };
            
            newAttendanceData.push(newRecord);
          });
          
          // 状態を更新
          setAttendanceData(newAttendanceData);
          
          // 同期開始を表示
          setSyncProgress({ show: true, progress: 0, stage: '勤務データ更新中...' });
          
          // StorageServiceを使って一括保存
          const success = await StorageService.saveData(
            STORAGE_KEYS.ATTENDANCE_DATA, 
            newAttendanceData,
            (stage, progress) => {
              setSyncProgress({ 
                show: true, 
                progress: progress, 
                stage: `勤務データ: ${stage}` 
              });
            }
          );
          
          // 保存結果の処理
          if (success) {
            setPendingChanges(false);
            setSyncProgress({ show: true, progress: 100, stage: '更新完了!' });
            
            setTimeout(() => {
              setSyncProgress({ show: false, progress: 0, stage: '' });
              showToast(`${cellsCount}件の勤務区分を一括更新しました`, "success");
            }, 1000);
          } else {
            setPendingChanges(true);
            setSyncProgress({ show: false, progress: 0, stage: '' });
            showToast("クラウドへの同期に失敗しました。データはローカルに保存されています", "warning");
          }
        } catch (error) {
          console.error('一括更新エラー:', error);
          showToast("勤務区分の一括更新に失敗しました", "error");
          setSyncProgress({ show: false, progress: 0, stage: '' });
        }
        return;
      }
      
      // 通常の編集モード
      if (!selectedCell || !selectedWorkType) return;
      
      // まずモーダルを閉じる - これが重要な変更
      const cellCopy = {...selectedCell};
      const workTypeCopy = selectedWorkType;
      
      setShowWorkTypeModal(false);
      setSelectedCell(null);
      setSelectedWorkType("");
      
      try {
        const dateStr = format(cellCopy.date, "yyyy-MM-dd");
        
        // 既存データを除外して新しいデータを作成
        const newAttendanceData = attendanceData.filter(
          (record) =>
            !(
              record.employeeId === cellCopy.employeeId.toString() &&
              record.date === dateStr
            )
        );
    
        const newRecord: AttendanceRecord = {
          employeeId: cellCopy.employeeId.toString(),
          date: dateStr,
          workType: workTypeCopy,
          employeeName: employees.find(
            (emp) => emp.id === cellCopy.employeeId
          )?.name,
        };
    
        // 更新されたデータ
        const updatedData = [...newAttendanceData, newRecord];
        
        // 状態を更新
        setAttendanceData(updatedData);
        
        // 同期開始を表示
        setSyncProgress({ show: true, progress: 0, stage: '勤務データ更新中...' });
        
        // StorageServiceを使って一括保存
        const success = await StorageService.saveData(
          STORAGE_KEYS.ATTENDANCE_DATA, 
          updatedData,
          (stage, progress) => {
            setSyncProgress({ 
              show: true, 
              progress: progress, 
              stage: `勤務データ: ${stage}` 
            });
          }
        );
        
        // 保存結果の処理
        if (success) {
          setPendingChanges(false);
          setSyncProgress({ show: true, progress: 100, stage: '更新完了!' });
          
          setTimeout(() => {
            setSyncProgress({ show: false, progress: 0, stage: '' });
            const employeeName = employees.find(emp => emp.id === cellCopy.employeeId)?.name || "";
            showToast(`${employeeName}さんの勤務区分を登録しました`, "success");
          }, 1000);
        } else {
          setPendingChanges(true);
          setSyncProgress({ show: false, progress: 0, stage: '' });
          showToast("クラウドへの同期に失敗しました。データはローカルに保存されています", "warning");
        }
      } catch (error) {
        console.error('勤務区分更新エラー:', error);
        showToast("勤務区分の更新に失敗しました", "error");
        setSyncProgress({ show: false, progress: 0, stage: '' });
      }
    };

    const handleDelete = () => {
      // 一括編集モードの場合
      if (isBulkEditMode && isAdminMode && selectedCells.length > 0) {
        showConfirm(`選択された${selectedCells.length}件の勤務区分を削除しますか？`, async () => {
          try {
            console.log(`${selectedCells.length}件の勤務区分の一括削除を開始`);
            
            // 削除成功した件数をカウント
            let successCount = 0;
            
            // 各セルの勤務データを個別に削除
            for (const cell of selectedCells) {
              const dateStr = format(cell.date, "yyyy-MM-dd");
              const success = await StorageService.deleteAttendanceRecord(
                cell.employeeId.toString(), 
                dateStr
              );
              if (success) successCount++;
            }
            
            // 削除後のデータを取得
            const newAttendanceData = attendanceData.filter(record => {
              return !selectedCells.some(cell => 
                cell.employeeId.toString() === record.employeeId && 
                format(cell.date, "yyyy-MM-dd") === record.date
              );
            });
            
            // 状態を更新
            setAttendanceData(newAttendanceData);
            setShowWorkTypeModal(false);
            setSelectedCells([]);
            
            // 成功メッセージを表示
            if (successCount === selectedCells.length) {
              showToast(`${successCount}件の勤務区分を削除しました`, "success");
              setPendingChanges(false);
            } else {
              showToast(`${successCount}/${selectedCells.length}件の勤務区分を削除しました`, "warning");
              setPendingChanges(true);
            }
          } catch (error) {
            console.error('一括削除エラー:', error);
            showToast("勤務区分の削除に失敗しました", "error");
          }
        });
        return;
      }
      
      // 単一勤務区分の削除
      if (!selectedCell) return;
      
      const dateStr = format(selectedCell.date, "yyyy-MM-dd");
      
      showConfirm("この勤務区分を削除しますか？", async () => {
        try {
          console.log(`勤務区分削除: 従業員ID=${selectedCell.employeeId}, 日付=${dateStr}`);
          
          // 専用の削除メソッドを使用
          const success = await StorageService.deleteAttendanceRecord(
            selectedCell.employeeId.toString(), 
            dateStr
          );
          
          if (success) {
            // 状態を更新
            const newAttendanceData = attendanceData.filter(
              record => !(record.employeeId === selectedCell.employeeId.toString() && record.date === dateStr)
            );
            
            setAttendanceData(newAttendanceData);
            setPendingChanges(false);
            showToast("勤務区分を削除しました", "success");
          } else {
            showToast("勤務区分の削除に問題が発生しました", "warning");
            setPendingChanges(true);
          }
          
          setShowWorkTypeModal(false);
          setSelectedCell(null);
          
        } catch (error) {
          console.error('勤務区分削除エラー:', error);
          showToast("勤務区分の削除に失敗しました", "error");
        }
      });
    };

    return (
      <Modal
        isOpen={showWorkTypeModal}
        onClose={() => {
          setShowWorkTypeModal(false);
          setSelectedCell(null);
          if (isBulkEditMode && isAdminMode) {
            setSelectedCells([]);
          }
        }}
        title={isBulkEditMode && isAdminMode && selectedCells.length > 0 ? "勤務区分の一括設定" : "勤務区分の選択"}
      >
        <div className="p-4">
          {isBulkEditMode && isAdminMode && selectedCells.length > 0 ? (
            <>
              <h3 className="text-lg font-bold mb-4">勤務区分の一括登録</h3>
              <p className="mb-4">
                選択された {selectedCells.length} 件のセルに適用する勤務区分を選択してください。
              </p>
            
              <div className="max-h-40 overflow-y-auto mb-4 border p-2 rounded">
                {selectedCells.map((cell, index) => {
                  const emp = employees.find(e => e.id === cell.employeeId);
                  return (
                    <div key={index} className="text-sm">
                      {emp?.name} / {format(cell.date, "M月d日")}
                    </div>
                  );
                })}
              </div>
            </>
          ) : selectedCell && (
            <>
              <h3 className="text-lg font-bold mb-4">勤務区分の登録</h3>
              <p className="mb-4">
                {
                  employees.find((emp) => emp.id === selectedCell.employeeId)
                    ?.name
                }
                さん
                {format(selectedCell.date, "M月d日")}の勤務区分を選択してください
              </p>
              </>
          )}
          
          <select
            value={selectedWorkType}
            onChange={(e) => setSelectedWorkType(e.target.value)}
            className="w-full p-2 border rounded mb-4"
          >
            <option value="">選択してください</option>
            {workTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            {(selectedWorkType || (selectedCell && attendanceData.some(
              record => record.employeeId === selectedCell.employeeId.toString() && 
                       record.date === format(selectedCell.date, "yyyy-MM-dd")
            )) || (selectedCells.length > 0 && selectedCells.some(cell => 
              attendanceData.some(
                record => record.employeeId === cell.employeeId.toString() && 
                         record.date === format(cell.date, "yyyy-MM-dd")
              )
            ))) && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                削除
              </button>
            )}
            <button
              onClick={() => {
                setShowWorkTypeModal(false);
                setSelectedCell(null);
                if (isBulkEditMode && isAdminMode) {
                  setSelectedCells([]);
                }
              }}
              className="px-4 py-2 bg-gray-200 rounded"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-500 text-white rounded"
              disabled={!selectedWorkType}
            >
              {isBulkEditMode && isAdminMode && selectedCells.length > 0 ? "一括適用" : "登録"}
            </button>
          </div>
        </div>
      </Modal>
    );
  };
  
  // 日付詳細モーダル
  const AttendanceDetailModal = () => {
    if (!selectedDateDetails) return null;

    return (
      <Modal
        isOpen={showAttendanceDetailModal}
        onClose={() => setShowAttendanceDetailModal(false)}
        title={`${format(selectedDateDetails.date, "M月d日")}の勤務状況`}
      >
        <div className="space-y-4 p-4">
          {Object.entries(calculateDailySummary(selectedDateDetails.date)).length > 0 ? (
            sortWorkTypeSummary(calculateDailySummary(selectedDateDetails.date)).map(
              ([type, count]) => {
                const workTypeLabel =
                  workTypes.find((w) => w.id === type)?.label || type;
                const records = selectedDateDetails.records.filter(
                  (r) => r.workType === type
                );

                return (
                  <div key={type} className="border-b pb-2">
                    <div className="font-bold">
                      {workTypeLabel}: {count}名
                    </div>
                    <div className="text-sm text-gray-600">
                      {records
                        // 従業員リストの順序と同じ順で表示するためにソート
                        .sort((a, b) => {
                          const empAIndex = employees.findIndex(e => e.id.toString() === a.employeeId);
                          const empBIndex = employees.findIndex(e => e.id.toString() === b.employeeId);
                          return empAIndex - empBIndex;
                        })
                        .map((record) => (
                          <div key={record.employeeId} className="flex justify-between">
                            <span>{record.employeeName}</span>
                            {isAdminMode && (
                              <button
                                onClick={() => {
                                  const emp = employees.find(e => e.id.toString() === record.employeeId);
                                  if (emp) {
                                    setSelectedCell({
                                      employeeId: emp.id,
                                      date: selectedDateDetails.date
                                    });
                                    setShowAttendanceDetailModal(false);
                                    setShowWorkTypeModal(true);
                                  }
                                }}
                                className="text-blue-500 hover:underline"
                              >
                                編集
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                );
              }
            )
          ) : (
            <div className="text-gray-500 text-center py-4">
              この日の勤務記録はありません
            </div>
          )}
          
          {/* 予定の表示 */}
          <div className="mt-4">
            <h3 className="font-bold border-b pb-1 mb-2">予定</h3>
            {getScheduleForDate(selectedDateDetails.date).length > 0 ? (
              getScheduleForDate(selectedDateDetails.date).map(schedule => {
                // 従業員名のテキスト生成
                let employeeText = "全員";
                
                if (schedule.employeeIds && schedule.employeeIds.length > 0) {
                  // 新形式のデータ
                  if (schedule.employeeIds.length === 1) {
                    // 1人だけの場合
                    const emp = employees.find(e => e.id.toString() === schedule.employeeIds[0]);
                    employeeText = emp ? emp.name : "不明";
                  } else {
                    // 複数人の場合（最大2名まで表示し、それ以上は数で表示）
                    const empNames = schedule.employeeIds.map(id => {
                      const emp = employees.find(e => e.id.toString() === id);
                      return emp ? emp.name : "不明";
                    });
                    
                    if (empNames.length <= 2) {
                      employeeText = empNames.join('、');
                    } else {
                      employeeText = `${empNames[0]}、${empNames[1]}他 (計${empNames.length}人)`;
                    }
                  }
                } else if (schedule.employeeId && schedule.employeeId !== "") {
                  // 旧形式のデータ（個人指定）
                  const emp = employees.find(e => e.id.toString() === schedule.employeeId);
                  employeeText = emp ? emp.name : "不明";
                }
                
                return (
                  <div key={schedule.id} className="mb-2 p-2 rounded" style={{ backgroundColor: `${schedule.color}20` }}>
                    <div className="font-medium flex justify-between">
                      <span>{schedule.title}</span>
                      <span className="text-sm text-gray-600">{employeeText}</span>
                    </div>
                    {schedule.details && (
                      <div className="text-sm text-gray-600 mt-1">{schedule.details}</div>
                    )}
                    <div className="mt-2 text-right">
                      <button
                        onClick={() => {
                          setSelectedScheduleDate(selectedDateDetails.date);
                          setSelectedScheduleItem(schedule);
                          setShowAttendanceDetailModal(false);
                          setShowScheduleModal(true);
                        }}
                        className="text-blue-500 hover:underline text-sm"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="text-red-500 hover:underline text-sm ml-3"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-gray-500 text-center py-2">
                この日の予定はありません
              </div>
            )}
            
            <div className="text-center mt-4">
              <button
                onClick={() => {
                  setSelectedScheduleDate(selectedDateDetails.date);
                  setSelectedScheduleItem(null);
                  setShowAttendanceDetailModal(false);
                  setShowScheduleModal(true);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                新しい予定を追加
              </button>
            </div>
          </div>
        </div>
      </Modal>
    );
  };
  
  // 予定追加モーダル
  const ScheduleModal = () => {
    const [title, setTitle] = useState("");
    const [details, setDetails] = useState("");
    const [color, setColor] = useState(PRESET_COLORS[0].value);
    const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
    const [isAllEmployees, setIsAllEmployees] = useState(true);
    
    // 編集モードの場合は既存の値をセット
    useEffect(() => {
      if (selectedScheduleItem) {
        setTitle(selectedScheduleItem.title);
        setDetails(selectedScheduleItem.details || "");
        setColor(selectedScheduleItem.color || PRESET_COLORS[0].value);
        
        // 既存データの互換性対応
        if (selectedScheduleItem.employeeIds && selectedScheduleItem.employeeIds.length > 0) {
          // 新しい形式のデータ
          setSelectedEmployees(selectedScheduleItem.employeeIds);
          setIsAllEmployees(selectedScheduleItem.employeeIds.length === 0);
        } else {
          // 古い形式のデータ
          if (selectedScheduleItem.employeeId) {
            setSelectedEmployees(
              selectedScheduleItem.employeeId === "" ? [] : [selectedScheduleItem.employeeId]
            );
            setIsAllEmployees(selectedScheduleItem.employeeId === "");
          } else {
            setSelectedEmployees([]);
            setIsAllEmployees(true);
          }
        }
      } else {
        setTitle("");
        setDetails("");
        setColor(PRESET_COLORS[0].value);
        setSelectedEmployees([]);
        setIsAllEmployees(true);
      }
    }, [selectedScheduleItem]);

    const handleSubmit = async () => {
      if (!title.trim() || !selectedScheduleDate) return;
      
      // まずモーダルを閉じる - これが重要な変更
      const dateStr = format(selectedScheduleDate, "yyyy-MM-dd");
      const employeeIds = isAllEmployees ? [] : [...selectedEmployees];
      const titleCopy = title.trim();
      const detailsCopy = details;
      const colorCopy = color;
      const isUpdate = selectedScheduleItem !== null;
      const selectedItemCopy = selectedScheduleItem ? {...selectedScheduleItem} : null;
      
      // モーダルを閉じてUI状態をリセット
      closeScheduleModal();
      
      // 同期開始を表示
      setSyncProgress({ show: true, progress: 0, stage: '予定データ更新中...' });
      
      try {
        let newScheduleData;
        
        setSyncProgress({ show: true, progress: 10, stage: 'データ準備中...' });
        
        if (isUpdate && selectedItemCopy) {
          // 既存の予定を更新
          newScheduleData = scheduleData.map(item => 
            item.id === selectedItemCopy.id 
              ? { 
                  ...item, 
                  title: titleCopy, 
                  details: detailsCopy, 
                  color: colorCopy, 
                  employeeId: isAllEmployees ? "" : (employeeIds[0] || ""), // 後方互換性のため
                  employeeIds: employeeIds
                }
              : item
          );
        } else {
          // 新規予定を追加
          const newScheduleItem: ScheduleItem = {
            id: Date.now().toString(),
            employeeId: isAllEmployees ? "" : (employeeIds[0] || ""), // 後方互換性のため
            employeeIds: employeeIds,
            date: dateStr,
            title: titleCopy,
            details: detailsCopy,
            color: colorCopy
          };
          
          newScheduleData = [...scheduleData, newScheduleItem];
        }
        
        // 状態を更新
        setScheduleData(newScheduleData);
        
        setSyncProgress({ show: true, progress: 20, stage: 'データをストレージに保存中...' });
        
        // StorageServiceを使って保存 (すべてのストレージに一貫して保存)
        const success = await StorageService.saveData(
          STORAGE_KEYS.SCHEDULE_DATA, 
          newScheduleData,
          (stage, progress) => {
            setSyncProgress({ 
              show: true, 
              progress: 20 + (progress * 0.8), 
              stage: `予定データ: ${stage}` 
            });
          }
        );
        
        if (success) {
          // 成功時
          setSyncProgress({ show: true, progress: 100, stage: '更新完了!' });
          setTimeout(() => {
            setSyncProgress({ show: false, progress: 0, stage: '' });
            showToast(isUpdate ? "予定を更新しました" : "新しい予定を追加しました", "success");
          }, 1000);
          
          // オンライン時は自動同期済みなのでフラグを下げる
          if (navigator.onLine) {
            setPendingChanges(false);
          } else {
            setPendingChanges(true);
            showToast("データをローカルに保存しました (オフライン)", "info");
          }
        } else {
          // 失敗時
          setSyncProgress({ show: false, progress: 0, stage: '' });
          showToast("データの一部保存に失敗しました。同期ボタンで再同期してください", "warning");
          setPendingChanges(true);
        }
      } catch (error) {
        console.error('予定操作エラー:', error);
        showToast("予定の保存に失敗しました", "error");
        setSyncProgress({ show: false, progress: 0, stage: '' });
      }
    };
    
    const handleEmployeeToggle = (employeeId: string) => {
      // 全員向けがオンの場合は選択できない
      if (isAllEmployees) return;
      
      setSelectedEmployees(prev => {
        if (prev.includes(employeeId)) {
          return prev.filter(id => id !== employeeId);
        } else {
          return [...prev, employeeId];
        }
      });
    };
    
    const handleDelete = () => {
      if (selectedScheduleItem) {
        deleteSchedule(selectedScheduleItem.id);
      }
    };
    
    const closeScheduleModal = () => {
      setShowScheduleModal(false);
      setSelectedScheduleDate(null);
      setSelectedScheduleItem(null);
    };
    
    return (
      <Modal
        isOpen={showScheduleModal}
        onClose={closeScheduleModal}
        title={selectedScheduleItem ? "予定の編集" : "予定の追加"}
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対象日</label>
            <div className="p-2 border rounded bg-gray-50">
              {selectedScheduleDate && format(selectedScheduleDate, "yyyy年M月d日")}
              {selectedScheduleDate && isJapaneseHoliday(selectedScheduleDate) && (
                <span className="ml-2 text-red-500 text-sm">
                  {getHolidayName(selectedScheduleDate)}
                </span>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対象者</label>
            <div className="mb-2">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="allEmployees"
                  checked={isAllEmployees}
                  onChange={(e) => setIsAllEmployees(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="allEmployees" className="text-sm font-medium">全員共通</label>
              </div>
              
              {!isAllEmployees && (
                <div className="max-h-40 overflow-y-auto border rounded p-2">
                  {employees.map(emp => (
                    <div key={emp.id} className="flex items-center my-1">
                      <input
                        type="checkbox"
                        id={`emp-${emp.id}`}
                        checked={selectedEmployees.includes(emp.id.toString())}
                        onChange={() => handleEmployeeToggle(emp.id.toString())}
                        className="mr-2"
                      />
                      <label htmlFor={`emp-${emp.id}`} className="text-sm">{emp.name}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {!isAllEmployees && selectedEmployees.length === 0 && (
              <p className="text-sm text-red-500">※ 少なくとも1人の従業員を選択してください。</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">タイトル <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="予定のタイトル"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">詳細</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full p-2 border rounded"
              rows={3}
              placeholder="予定の詳細（任意）"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">色</label>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {PRESET_COLORS.map((colorOption) => (
                <button
                  key={colorOption.value}
                  type="button"
                  className={`w-full h-8 rounded-md ${color === colorOption.value ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                  style={{ backgroundColor: colorOption.value }}
                  onClick={() => setColor(colorOption.value)}
                  title={colorOption.name}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="p-1 border rounded"
              />
              <span className="text-sm">カスタム色</span>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            {selectedScheduleItem && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                削除
              </button>
            )}
            <button
              onClick={closeScheduleModal}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              disabled={!title.trim() || (!isAllEmployees && selectedEmployees.length === 0)}
            >
              {selectedScheduleItem ? "更新" : "追加"}
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // ストレージ使用状況モーダル
  const StorageUsageModal = () => {
    if (!storageUsageData) return null;
    
    return (
      <Modal
        isOpen={showStorageUsageModal}
        onClose={() => setShowStorageUsageModal(false)}
        title="ストレージ使用状況"
      >
        <div className="p-4 space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="text-lg font-bold">ローカルストレージ概要</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>総使用量:</div>
              <div>{storageUsageData.totalSize}</div>
              <div>使用率:</div>
              <div>{storageUsageData.usagePercentage}</div>
              <div>残り容量:</div>
              <div>{(storageUsageData.available / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          </div>
          
          <div className="bg-yellow-50 p-3 rounded-lg">
            <div className="text-lg font-bold">Firebase Storage情報</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>使用量:</div>
              <div>{firebaseStorageInfo.usageGiB} GiB</div>
              <div>最大容量:</div>
              <div>{firebaseStorageInfo.maxGiB} GiB</div>
              <div>使用率:</div>
              <div>{firebaseStorageInfo.percentage}</div>
            </div>
          </div>
          
          <div>
            <div className="text-lg font-bold mb-2">ローカルストレージ詳細</div>
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">キー</th>
                    <th className="border p-2 text-right">サイズ</th>
                  </tr>
                </thead>
                <tbody>
                  {storageUsageData.details.map((item: any, index: number) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="border p-2">{item.key}</td>
                      <td className="border p-2 text-right">{item.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={() => setShowStorageUsageModal(false)}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              閉じる
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // 月選択モーダル
  const MonthSelectionModal = () => {
    const availableMonths = getAvailableMonths();
    
    const handleAction = () => {
      if (monthSelectionMode === "export") {
        exportToExcel(selectedMonth);
      } else {
        resetMonthData(selectedMonth);
      }
    };
    
    return (
      <Modal
        isOpen={showMonthSelectionModal}
        onClose={() => setShowMonthSelectionModal(false)}
        title={monthSelectionMode === "export" ? "勤務データをエクスポート" : "月次データリセット"}
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              月を選択してください
            </label>
            <select
              value={format(selectedMonth, "yyyy-MM")}
              onChange={(e) => {
                const [year, month] = e.target.value.split("-").map(Number);
                setSelectedMonth(new Date(year, month - 1, 1));
              }}
              className="w-full p-2 border rounded"
            >
              {availableMonths.map((month) => (
                <option key={format(month, "yyyy-MM")} value={format(month, "yyyy-MM")}>
                  {formatMonthDisplay(month)}
                </option>
              ))}
            </select>
          </div>
          
          {monthSelectionMode === "export" ? (
            <div className="mt-4">
              <p className="text-sm">
                選択した月の勤務データをExcelファイルとしてエクスポートします。
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-red-600 font-bold">
                警告: この操作は元に戻せません。
              </p>
              <p className="text-sm mt-1">
                選択した月の全てのデータ（勤務記録と予定）を削除します。
              </p>
            </div>
          )}
          
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setShowMonthSelectionModal(false)}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              キャンセル
            </button>
            <button
              onClick={handleAction}
              className={`px-4 py-2 ${
                monthSelectionMode === "export" 
                  ? "bg-blue-500 hover:bg-blue-600" 
                  : "bg-red-500 hover:bg-red-600"
              } text-white rounded`}
            >
              {monthSelectionMode === "export" ? "エクスポート" : "リセット"}
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // 管理者設定トグル
  const AdminToggle = () => {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white p-2 rounded-lg shadow-lg flex flex-col gap-2">
          <button
            onClick={() => {
              // スクロール位置を取得してから状態変更
              captureTableScroll();
              try {
                // localStorageにも一時的に保存
                localStorage.setItem('_admin_toggle_scroll', JSON.stringify({
                  x: window.scrollX,
                  y: window.scrollY,
                  table: globalScrollPosition,
                  time: Date.now()
                }));
              } catch (e) {
                console.error('Failed to save scroll for admin toggle', e);
              }
              setIsAdminMode(!isAdminMode);
            }}
            className={`p-3 rounded-full ${isAdminMode ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            title={isAdminMode ? '管理者モード：オン' : '管理者モード：オフ'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </button>
          {isAdminMode && (
            <button
              onClick={() => {
                captureTableScroll(); // スクロール位置を保存
                showStorageUsage();
              }}
              className="p-3 rounded-full bg-gray-200 hover:bg-gray-300"
              title="ストレージ使用状況を確認"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12H2"></path>
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                <line x1="6" y1="16" x2="6.01" y2="16"></line>
                <line x1="10" y1="16" x2="10.01" y2="16"></line>
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  };
  //---------------------------------------------------------------
  // メインレンダリング
  //---------------------------------------------------------------
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100">
        {isLoading ? (
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="spinner mb-4"></div>
              <p className="text-gray-600">データを読み込み中...</p>
            </div>
          </div>
        ) : (
          <div className="container mx-auto p-4 max-w-full">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div className="flex gap-2 items-center flex-wrap">
                <button
                  onClick={() => setCurrentView("calendar")}
                  className={`px-4 py-2 rounded ${
                    currentView === "calendar"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200"
                  }`}
                >
                  全体カレンダー
                </button>
                <button
                  onClick={() => {
                    setCurrentView("table");
                    if (selectedEmployee) {
                      setCurrentView("singleEmployeeCalendar");
                    }
                  }}
                  className={`px-4 py-2 rounded ${
                    currentView === "table" || currentView === "singleEmployeeCalendar"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200"
                  }`}
                >
                  勤務表
                </button>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <button
                  onClick={() =>
                    setCurrentDate(
                      new Date(
                        currentDate.getFullYear(),
                        currentDate.getMonth() - 1
                      )
                    )
                  }
                  className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
                >
                  前月
                </button>
                <span className="font-bold">
                  {format(currentDate, "yyyy年M月")}
                </span>
                <button
                  onClick={() =>
                    setCurrentDate(
                      new Date(
                        currentDate.getFullYear(),
                        currentDate.getMonth() + 1
                      )
                    )
                  }
                  className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
                >
                  次月
                </button>
                
                {/* エクスポートボタン - 管理者モードのみ表示 */}
                {isAdminMode && (
                  <button
                    onClick={() => showMonthSelection("export")}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    勤務データをエクスポート
                  </button>
                )}
                
                {/* リセットボタン - 管理者モードのみ表示 */}
                {isAdminMode && (
                  <div className="relative group">
                    <button
                      className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      データリセット
                    </button>
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded shadow-lg hidden group-hover:block z-50">
                      <button
                        onClick={() => showMonthSelection("reset")}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        月次データリセット
                      </button>
                      <button
                        onClick={resetAllData}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                      >
                        全データをリセット
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* ビューの表示 */}
            <div className="bg-white p-4 rounded-lg shadow-md">
              {currentView === "calendar" && <CalendarView />}
              {currentView === "table" && <TableView />}
              {currentView === "singleEmployeeCalendar" && <SingleEmployeeCalendarView />}
            </div>
            
            {/* トースト通知 */}
            {toast.show && (
              <div className={`toast ${
                toast.type === 'success' ? 'bg-green-500' : 
                toast.type === 'error' ? 'bg-red-500' : 
                toast.type === 'warning' ? 'bg-yellow-500' : 
                'bg-blue-500'
              }`}>
                {toast.message}
              </div>
            )}

            {/* モーダル */}
            <WorkTypeSelectionModal />
            <AttendanceDetailModal />
            <ScheduleModal />
            <StorageUsageModal />
            <MonthSelectionModal />
            <ConfirmModal
              isOpen={showConfirmModal}
              onClose={() => setShowConfirmModal(false)}
              onConfirm={confirmModalAction}
              message={confirmModalMessage}
            />
            <SuccessModal
              isOpen={showSuccessModal}
              onClose={() => setShowSuccessModal(false)}
              message={successMessage}
            />
            <AdminToggle />
            
            {/* オフライン通知とデータ同期ボタン */}
            <SyncButton 
             onClick={syncChanges} 
             isVisible={navigator.onLine && pendingChanges} 
            />
            {/* 同期プログレスバー */}
            <SyncProgressBar />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AttendanceApp;