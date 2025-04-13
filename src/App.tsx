import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { format, parse, isSameMonth, addMonths, subMonths, startOfMonth, isAfter, isBefore, isSameDay } from "date-fns";
import * as XLSX from "xlsx";
import JapaneseHolidays from "japanese-holidays";
import Modal from "./components/Modal";
import ConfirmModal from "./components/ConfirmModal";
import SuccessModal from "./components/SuccessModal";
import ErrorBoundary from "./components/ErrorBoundary";
import SyncButton from "./components/SyncButton";
import OfflineIndicatorComponent from "./components/OfflineIndicator";
import './styles/sync-button.css';
import './styles/offline-indicator.css';
import { StorageService, STORAGE_KEYS } from "./services/storage";
import './index.css';
import { IndexedDBService } from './services/indexedDBService';
import { AttendanceRecord } from "./types";

// Japanese-holidaysの型定義
declare module "japanese-holidays" {
  export function isHoliday(date: Date): string | undefined;
}

//=====================================================================
// Part 1: ユーティリティと共通関数
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

// 土曜日かどうかを判定する関数
const isSaturday = (date: Date): boolean => {
  return date.getDay() === 6; // 土曜日(6)
};

// 平日（月〜金）かどうかを判定する関数
const isWeekday = (date: Date): boolean => {
  const day = date.getDay();
  return day >= 1 && day <= 5; // 月曜日(1)から金曜日(5)まで
};

// UI更新の非同期実行（共通化関数）
const safeExecute = (callback: () => void, delay = 0) => {
  if (delay > 0) {
    setTimeout(() => requestAnimationFrame(callback), delay);
  } else {
    requestAnimationFrame(callback);
  }
};

// ローカルストレージに安全に保存する関数
const safeLocalStorage = {
  set: (key: string, value: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Failed to save to localStorage: ${key}`, e);
      return false;
    }
  },
  get: <T,>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error(`Failed to get from localStorage: ${key}`, e);
      return defaultValue;
    }
  }
};

//=====================================================================
// Part 2: インターフェースと型定義
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

// モーダル表示状態の型（共通化のために追加）
interface ModalState {
  workType: boolean;
  attendanceDetail: boolean;
  schedule: boolean;
  success: boolean;
  confirm: boolean;
  monthSelection: boolean;
  storageUsage: boolean;
}

// スクロール位置管理用の型
interface ScrollPosition {
  x: number;
  y: number;
  time?: number;
}

//=====================================================================
// Part 3: 定数と設定
//=====================================================================

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

// 警告条件の勤務区分設定
const WARNING_WORK_TYPES_CONDITION1 = [
  "休", "A", "P", "年", "a", "p", "Ap", "Fビ", "a1/P", "a2/P", "a3/P", "A/p1", "A/p3"
];

const WARNING_WORK_TYPES_CONDITION2 = ["A", "P", "a", "p"];

const WARNING_WORK_TYPES_CONDITION3 = WARNING_WORK_TYPES_CONDITION1;

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
  { id: 17, name: "若木　雄太" },
  { id: 18, name: "藤田　向陽" },
  { id: 19, name: "中谷　優衣" },
  { id: 20, name: "濱田　泰陽" },
  { id: 21, name: "佐々木　幹也" },
  { id: 22, name: "前田　愛都" },
  { id: 23, name: "益田　幸枝" },
  { id: 24, name: "井上　真理子" },
  { id: 25, name: "斎藤　綾子" },
  { id: 26, name: "越野　裕太" },
  { id: 27, name: "非常勤（桑原　真尋）" }
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
  // 状態管理（グループ化して整理）
  //---------------------------------------------------------------
  // 表示関連
  const [currentView, setCurrentView] = useState<View>("calendar");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");

  // データ関連
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // オフライン・同期状態
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [pendingChanges, setPendingChanges] = useState<boolean>(false);
  
  // スクロール位置管理
  const [globalScrollPosition, setGlobalScrollPosition] = useState<ScrollPosition>({ x: 0, y: 0 });
  const tableContainerGlobalRef = useRef<HTMLDivElement | null>(null);

  // Firebase情報
  const [firebaseStorageInfo, setFirebaseStorageInfo] = useState<{
    usageGiB: string;
    maxGiB: string;
    percentage: string;
  }>({ usageGiB: "0", maxGiB: "1", percentage: "0" });

  // モーダル表示状態（共通化して管理）
  const [modalState, setModalState] = useState<ModalState>({
    workType: false,
    attendanceDetail: false,
    schedule: false,
    success: false,
    confirm: false,
    monthSelection: false,
    storageUsage: false
  });
  
  // モーダル関連データ
  const [confirmModalMessage, setConfirmModalMessage] = useState("");
  const [confirmModalAction, setConfirmModalAction] = useState<() => void>(() => {});
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<Date>(currentDate);
  const [monthSelectionMode, setMonthSelectionMode] = useState<"export" | "reset">("export");
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

  // モバイル機能
  const [isMobileSelectMode, setIsMobileSelectMode] = useState<boolean>(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState<boolean>(false);

  // 通知関連
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

  // ワークタイプ選択のための状態
  const [selectedWorkType, setSelectedWorkType] = useState("");
  
  //---------------------------------------------------------------
  // モーダル管理の共通関数
  //---------------------------------------------------------------
  // モーダルの表示・非表示を制御する関数
  const toggleModal = useCallback((modalName: keyof ModalState, isOpen: boolean) => {
    setModalState(prev => ({
      ...prev,
      [modalName]: isOpen
    }));
  }, []);
  
  // モーダル状態取得のヘルパー関数
  const getModalState = (modalName: keyof ModalState): boolean => {
    return modalState[modalName];
  };
  
  // スクロール位置を記憶する共通関数
  const rememberScrollPosition = useCallback(() => {
    // テーブルのスクロール位置を保存
    if (tableContainerGlobalRef.current && currentView === "table") {
      const newPosition = {
        x: tableContainerGlobalRef.current.scrollLeft,
        y: tableContainerGlobalRef.current.scrollTop
      };
      
      setGlobalScrollPosition(newPosition);
      
      // ローカルストレージにも保存
      safeLocalStorage.set('_table_scroll_pos', newPosition);
    }
    
    // ウィンドウのスクロール位置も保存
    const windowPosition = {
      x: window.scrollX || 0,
      y: window.scrollY || 0,
      time: Date.now()
    };
    
    safeLocalStorage.set('_scroll_position', windowPosition);
  }, [currentView]);
  
  // スクロール位置を復元する共通関数
  const restoreScrollPosition = useCallback(() => {
    // ウィンドウのスクロール位置を復元
    const savedPos = safeLocalStorage.get<ScrollPosition>('_scroll_position', { x: 0, y: 0, time: 0 });
    if (savedPos && savedPos.time && Date.now() - savedPos.time < 30000) {
      safeExecute(() => {
        window.scrollTo(savedPos.x, savedPos.y);
        
        // テーブルのスクロール位置も復元
        if (tableContainerGlobalRef.current && currentView === "table") {
          tableContainerGlobalRef.current.scrollLeft = globalScrollPosition.x;
          tableContainerGlobalRef.current.scrollTop = globalScrollPosition.y;
        }
      });
    }
  }, [globalScrollPosition, currentView]);
  
  // トースト通知を表示する共通関数
  const showToast = useCallback((message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setToast({
      show: true,
      message,
      type,
    });
  }, []);
  
  // 確認モーダルを表示する共通関数
  const showConfirm = useCallback((message: string, action: () => void) => {
    setConfirmModalMessage(message);
    setConfirmModalAction(() => action);
    toggleModal('confirm', true);
  }, [toggleModal]);
  
  // 成功モーダルを表示する共通関数
  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    toggleModal('success', true);
  }, [toggleModal]);

  //---------------------------------------------------------------
  // 副作用（useEffect）- グループ化して整理
  //---------------------------------------------------------------
  // 初期データロード（アプリ起動時に1回だけ実行）
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      
      try {
        // オフライン状態を先に確認
        const isNetworkOffline = !navigator.onLine;
        setIsOffline(isNetworkOffline);
        
        // 並列データ読み込みで最適化
        const [
          attendance,
          schedule,
          viewSetting,
          savedDateStr,
          selectedEmp,
          adminMode
        ] = await Promise.all([
          StorageService.getDataAsync<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE_DATA, []),
          StorageService.getDataAsync<ScheduleItem[]>(STORAGE_KEYS.SCHEDULE_DATA, []),
          StorageService.getDataAsync<View>(STORAGE_KEYS.CURRENT_VIEW, "calendar"),
          StorageService.getDataAsync<string>(STORAGE_KEYS.CURRENT_DATE, ""),
          StorageService.getDataAsync<string>(STORAGE_KEYS.SELECTED_EMPLOYEE, ""),
          StorageService.getDataAsync<boolean>(STORAGE_KEYS.ADMIN_MODE, false)
        ]);
        
        // 状態を一括更新（UIの一貫性を確保）
        const currentDateTime = savedDateStr ? new Date(savedDateStr) : new Date();
        
        setAttendanceData(attendance);
        setScheduleData(schedule);
        setCurrentView(viewSetting);
        setCurrentDate(currentDateTime);
        setSelectedMonth(currentDateTime);
        setSelectedEmployee(selectedEmp);
        setIsAdminMode(adminMode);
        
        // UIブロッキングを避けるため、警告表示を遅延実行
        if (adminMode) {
          safeExecute(() => {
            const warning = StorageService.checkStorageWarning(70);
            if (warning) {
              showToast(warning, "warning");
            }
          }, 300);
        }
        
        // Firebase情報も非同期で取得
        if (adminMode && !isNetworkOffline) {
          safeExecute(async () => {
            try {
              const firebaseInfo = await StorageService.getFirebaseStorageInfo();
              if (firebaseInfo) {
                setFirebaseStorageInfo(firebaseInfo);
              }
            } catch (e) {
              console.error("Firebase情報取得エラー:", e);
            }
          }, 500);
        }
        
        // オフライン通知
        if (isNetworkOffline) {
          safeExecute(() => {
            showToast("オフライン状態のため、ローカルデータを使用しています", "info");
          }, 300);
        }
        
        // 同期状態の確認
        safeExecute(() => {
          if (!isNetworkOffline && (attendance.length > 0 || schedule.length > 0)) {
            setPendingChanges(true);
          }
        }, 500);
        
      } catch (error) {
        console.error("データ初期化エラー:", error);
        showToast("データの読み込みに問題が発生しました。ページを再読み込みしてください", "error");
      } finally {
        // ローディング表示を少し遅らせて解除（UXを向上）
        safeExecute(() => {
          setIsLoading(false);
        }, 300);
      }
    };
    
    initializeData();
  }, [showToast]);

  // キーボードイベント、ビューポート設定（マウント時に1回だけ実行）
  useEffect(() => {
    // キーボードイベントリスナー
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(true);
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // ピンチズーム設定
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes');
    } else {
      const newViewportMeta = document.createElement('meta');
      newViewportMeta.name = 'viewport';
      newViewportMeta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes';
      document.getElementsByTagName('head')[0].appendChild(newViewportMeta);
    }
    
    // 初期オフライン状態を設定
    setIsOffline(!navigator.onLine);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // オンライン/オフライン状態監視
  useEffect(() => {
    const handleOnline = () => {
      console.log("オンライン状態に復帰");
      setIsOffline(false);
      
      // データがある場合のみ同期フラグを設定
      if (attendanceData.length > 0 || scheduleData.length > 0) {
        safeExecute(() => {
          setPendingChanges(true);
          showToast("オンラインに戻りました。同期ボタンからデータを同期できます", "info");
        });
      }
    };
    
    const handleOffline = () => {
      console.log("オフライン状態に切り替わりました");
      safeExecute(() => {
        setIsOffline(true);
        setPendingChanges(false);
        showToast("オフライン状態になりました。データはローカルに保存されます", "warning");
      });
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [attendanceData.length, scheduleData.length, showToast]);

  // 管理者モード変更時の処理
  useEffect(() => {
    if (!isAdminMode) {
      setIsBulkEditMode(false);
      setSelectedCells([]);
      setIsMobileSelectMode(false);
    }
    
    // スクロール位置を復元
    if (currentView === "table" && tableContainerGlobalRef.current) {
      safeExecute(() => {
        if (tableContainerGlobalRef.current) {
          tableContainerGlobalRef.current.scrollLeft = globalScrollPosition.x;
          tableContainerGlobalRef.current.scrollTop = globalScrollPosition.y;
        }
      }, 50);
    }
    
    // ストレージ使用状況を確認（管理者モードON時）
    if (isAdminMode) {
      safeExecute(() => {
        const warning = StorageService.checkStorageWarning(70);
        if (warning) {
          showToast(warning, "warning");
        }
        
        // Firebase使用状況を更新
        if (navigator.onLine) {
          StorageService.getFirebaseStorageInfo().then(info => {
            if (info) setFirebaseStorageInfo(info);
          }).catch(console.error);
        }
      }, 100);
    }
  }, [isAdminMode, currentView, globalScrollPosition, showToast]);

  // トースト通知の自動非表示
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // 状態変更時のストレージ保存処理
  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.CURRENT_VIEW, currentView)
      .catch(e => console.error("Failed to save current view:", e));
  }, [currentView]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.CURRENT_DATE, currentDate.toISOString())
      .catch(e => console.error("Failed to save current date:", e));
  }, [currentDate]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.SELECTED_EMPLOYEE, selectedEmployee)
      .catch(e => console.error("Failed to save selected employee:", e));
    
    // 従業員選択時のビュー自動変更
    if (selectedEmployee && currentView === "table") {
      safeExecute(() => setCurrentView("singleEmployeeCalendar"), 50);
    } else if (!selectedEmployee && currentView === "singleEmployeeCalendar") {
      safeExecute(() => setCurrentView("table"), 50);
    }
  }, [selectedEmployee, currentView]);

  // データ変更時の同期フラグ管理
  useEffect(() => {
    if (attendanceData.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE_DATA, JSON.stringify(attendanceData));
        if (navigator.onLine) setPendingChanges(true);
      } catch (e) {
        console.error("Failed to save attendance data to localStorage:", e);
      }
    }
  }, [attendanceData]);

  useEffect(() => {
    if (scheduleData.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEYS.SCHEDULE_DATA, JSON.stringify(scheduleData));
        if (navigator.onLine) setPendingChanges(true);
      } catch (e) {
        console.error("Failed to save schedule data to localStorage:", e);
      }
    }
  }, [scheduleData]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.ADMIN_MODE, isAdminMode)
      .catch(e => console.error("Failed to save admin mode:", e));
  }, [isAdminMode]);

  //---------------------------------------------------------------
  // ヘルパー関数（機能ごとにグループ化）
  //---------------------------------------------------------------
  // カレンダー日付生成
  const generateCalendarDates = useCallback((year: number, month: number) => {
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
  }, []);

  // 勤務区分の表示順にソート
  const sortWorkTypeSummary = useCallback((summary: DailySummary) => {
    return Object.entries(summary).sort((a: [string, number], b: [string, number]) => {
      const indexA = WORK_TYPE_DISPLAY_ORDER.indexOf(a[0]);
      const indexB = WORK_TYPE_DISPLAY_ORDER.indexOf(b[0]);
      
      // 表示順リストにある場合はその順序を使用
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      
      // どちらか一方だけリストにある場合は、リストにある方を優先
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // どちらもリストにない場合はアルファベット順
      return a[0].localeCompare(b[0]);
    });
  }, []);

  // テーブルのスクロール位置を保存
  const captureTableScroll = useCallback(() => {
    if (tableContainerGlobalRef.current && currentView === "table") {
      const position = {
        x: tableContainerGlobalRef.current.scrollLeft,
        y: tableContainerGlobalRef.current.scrollTop
      };
      setGlobalScrollPosition(position);
    }
  }, [currentView]);

  // 日次集計を計算
  const calculateDailySummary = useCallback((date: Date): DailySummary => {
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
  }, [attendanceData]);

  // 特定の日付の予定を取得
  const getScheduleForDate = useCallback((date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return scheduleData.filter(schedule => schedule.date === dateStr);
  }, [scheduleData]);

  // 特定の従業員と日付の予定を取得
  const getEmployeeScheduleForDate = useCallback((employeeId: number, date: Date) => {
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
  }, [scheduleData]);

  // 特定の従業員と日付の勤務区分を取得
  const getEmployeeWorkTypeForDate = useCallback((employeeId: number, date: Date): string | null => {
    const dateStr = format(date, "yyyy-MM-dd");

    const record = attendanceData.find(
      record => record.employeeId === employeeId.toString() && record.date === dateStr
    );

    return record ? record.workType : null;
  }, [attendanceData]);

  // 特定従業員の勤務区分スコアを計算
  const calculateEmployeeWorkTypeScore = useCallback((employeeId: number) => {
    let score = 0;
    const yearMonth = format(currentDate, "yyyy-MM");

    // 日付ごとに最新の勤務区分だけを取得するためのマップ
    const dateWorkTypeMap = new Map<string, string>();

    // 同じ日付のデータが複数ある場合、後のデータで上書き
    attendanceData.forEach(record => {
      if (record.employeeId === employeeId.toString() && record.date.startsWith(yearMonth)) {
        dateWorkTypeMap.set(record.date, record.workType);
      }
    });

    // マップに整理された（重複のない）データでスコア計算
    dateWorkTypeMap.forEach((workType, dateStr) => {
      if (workType === '休') {
        // 日付文字列から Date オブジェクトを作成
        const recordDate = new Date(dateStr);
        // 土曜日の場合は0.5点、それ以外の日は1.0点
        if (isSaturday(recordDate)) {
          score += 0.5;
        } else {
          score += 1.0;
        }
      } else if (workType === 'A' || workType === 'P' || workType === 'Ap') {
        score += 0.5;
      }
    });
      
    return score;
  }, [attendanceData, currentDate]);

  // 特定の勤務区分の合計人数をカウント
  const countSpecificWorkTypes = useCallback((date: Date, workTypeList: string[]): number => {
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
  }, [attendanceData]);

  // 指定した週に祝日があるかを判定
  const hasHolidayInWeek = useCallback((date: Date): boolean => {
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
  }, []);

  // 条件1: 平日で特定の勤務区分の合計が8人以上
  const checkCondition1 = useCallback((date: Date): boolean => {
    if (!isWeekday(date)) return false;

    const count = countSpecificWorkTypes(date, WARNING_WORK_TYPES_CONDITION1);
    return count >= 8;
  }, [countSpecificWorkTypes]);

  // 条件2: 祝日のある週の平日で特定の勤務区分の合計が4人以上
  const checkCondition2 = useCallback((date: Date): boolean => {
    if (!isWeekday(date) || !hasHolidayInWeek(date)) return false;

    const count = countSpecificWorkTypes(date, WARNING_WORK_TYPES_CONDITION2);
    return count >= 4;
  }, [countSpecificWorkTypes, hasHolidayInWeek]);

  // 条件3: 土曜日で特定の勤務区分の合計が6人以上
  const checkCondition3 = useCallback((date: Date): boolean => {
    if (!isSaturday(date)) return false;

    const count = countSpecificWorkTypes(date, WARNING_WORK_TYPES_CONDITION3);
    return count >= 6;
  }, [countSpecificWorkTypes]);

  // 警告表示が必要かどうかを判定
  const shouldShowWarning = useCallback((date: Date): boolean => {
    return checkCondition1(date) || checkCondition2(date) || checkCondition3(date);
  }, [checkCondition1, checkCondition2, checkCondition3]);

  // ストレージ使用状況を表示
  const showStorageUsage = useCallback(() => {
    const usage = StorageService.getStorageUsage();
    setStorageUsageData(usage);
    toggleModal('storageUsage', true);
  }, [toggleModal]);

  // 利用可能な年リストを生成
  const getAvailableYears = useCallback((): number[] => {
    const years: number[] = [];
    const startYear = 2025;
    const endYear = 2045;

    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }

    return years;
  }, []);

  // 利用可能な月リストを生成
  const getAvailableMonthsInYear = useCallback((): { value: number; label: string }[] => {
    const months: { value: number; label: string }[] = [];

    for (let month = 1; month <= 12; month++) {
      months.push({ value: month, label: `${month}月` });
    }

    return months;
  }, []);

  // 「〇〇年〇月」形式で日付を表示
  const formatMonthDisplay = useCallback((date: Date): string => {
    return format(date, "yyyy年M月");
  }, []);

  // 特定の月に含まれるデータをフィルタリング
  const filterDataByMonth = useCallback(<T extends { date: string }>(data: T[], month: Date): T[] => {
    const year = month.getFullYear();
    const monthNum = month.getMonth();

    return data.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate.getFullYear() === year && itemDate.getMonth() === monthNum;
    });
  }, []);

  // 月選択モーダルを表示
  const showMonthSelection = useCallback((mode: "export" | "reset") => {
    setMonthSelectionMode(mode);
    setSelectedMonth(currentDate);
    toggleModal('monthSelection', true);
  }, [currentDate, toggleModal]);

  // セルの選択・非選択を切り替え
  const toggleCellSelection = useCallback((employeeId: number, date: Date, ctrlKey: boolean = false) => {
    if (!isBulkEditMode || !isAdminMode) return;

    setSelectedCells(prev => {
      const cellIndex = prev.findIndex(
        cell => cell.employeeId === employeeId && cell.date.getTime() === date.getTime()
      );
      
      if (cellIndex !== -1) {
        // すでに選択されている場合は削除
        return prev.filter((_, i) => i !== cellIndex);
      } else {
        // 選択されていない場合は追加
        // Ctrlキーまたはモバイル選択モードが有効でない場合は選択をクリア
        if (!ctrlKey && !isMobileSelectMode && prev.length > 0) {
          return [{ employeeId, date }];
        } else {
          return [...prev, { employeeId, date }];
        }
      }
    });
  }, [isBulkEditMode, isAdminMode, isMobileSelectMode]);

  // セルが選択されているかを確認
  const isCellSelected = useCallback((employeeId: number, date: Date) => {
    return selectedCells.some(
      cell => cell.employeeId === employeeId && cell.date.getTime() === date.getTime()
    );
  }, [selectedCells]);

  // 全セルを選択
  const selectAllCellsForEmployee = useCallback((employeeId: number) => {
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
  }, [isBulkEditMode, isAdminMode, currentDate]);

  // 従業員の全セルの選択を解除
  const clearSelectionForEmployee = useCallback((employeeId: number) => {
    if (!isBulkEditMode || !isAdminMode) return;

    setSelectedCells(prev => 
      prev.filter(cell => cell.employeeId !== employeeId)
    );
  }, [isBulkEditMode, isAdminMode]);

  //---------------------------------------------------------------
  // データ操作関数
  //---------------------------------------------------------------
  // 高度に最適化された同期処理関数
  const syncChanges = async () => {
    try {
      console.log("同期処理を開始しました");
      
      // スクロール位置を先に保存
      captureTableScroll();
      
      // 同期開始時にプログレスバーを表示
      setSyncProgress({ show: true, progress: 0, stage: '同期準備中...' });
      
      // オフライン状態チェック
      if (isOffline || !navigator.onLine) {
        console.log("オフライン状態のため同期できません");
        showToast("オフライン状態のため同期できません。データはローカルに保存されています", "warning");
        setSyncProgress({ show: false, progress: 0, stage: '' });
        return false;
      }
      
      // 進捗コールバックを最適化
      const createOptimizedCallback = (prefix: string, startProgress: number, endProgress: number) => {
        let lastReportedProgress = 0;
        
        return (stage: string, progress: number) => {
          // 進捗率を計算（startからendの範囲にマッピング）
          const actualProgress = startProgress + ((progress / 100) * (endProgress - startProgress));
          
          // 進捗が10%以上変化した場合か、100%に達した場合のみ更新する
          const progressDiff = Math.abs(actualProgress - lastReportedProgress);
          if (progressDiff >= 10 || progress === 100 || progress === 0) {
            lastReportedProgress = actualProgress;
            
            // UIをブロックしないようrequestAnimationFrameを使用
            safeExecute(() => {
              setSyncProgress({ 
                show: true, 
                progress: Math.round(actualProgress), 
                stage: `${prefix}: ${stage}` 
              });
            });
          }
        };
      };
      
      // 同期処理を実行（主要な進捗ポイントのみでUIを更新）
      let syncSuccess = false;
      
      try {
        // 勤怠データの同期（0-40%）
        setSyncProgress({ show: true, progress: 5, stage: '勤怠データを同期中...' });
        const attendanceSuccess = await StorageService.saveData(
          STORAGE_KEYS.ATTENDANCE_DATA, 
          attendanceData,
          createOptimizedCallback('勤怠データ', 5, 40)
        );
        
        // 予定データの同期（40-90%）
        setSyncProgress({ show: true, progress: 40, stage: '予定データを同期中...' });
        const scheduleSuccess = await StorageService.saveData(
          STORAGE_KEYS.SCHEDULE_DATA, 
          scheduleData,
          createOptimizedCallback('予定データ', 40, 90)
        );
        
        syncSuccess = attendanceSuccess && scheduleSuccess;
      } catch (e) {
        console.error('Firebaseとの同期エラー:', e);
        showToast("クラウドとの同期に失敗しましたが、データはローカルに保存されています", "warning");
        setSyncProgress({ show: false, progress: 0, stage: '' });
        restoreScrollPosition();
        return false;
      }
      
      // 同期が成功したらフラグを下げる
      if (syncSuccess) {
        setPendingChanges(false);
        setSyncProgress({ show: true, progress: 100, stage: '同期完了!' });
        
        // 完了表示と非表示の間を開けて、UIの安定性を確保
        setTimeout(() => {
          safeExecute(() => {
            setSyncProgress({ show: false, progress: 0, stage: '' });
            showToast("データを同期しました", "success");
          });
          
          // Firebase使用状況を更新（管理者モードのみ）
          if (isAdminMode && navigator.onLine) {
            StorageService.getFirebaseStorageInfo().then(info => {
              if (info) {
                setFirebaseStorageInfo(info);
              }
            }).catch(e => {
              console.error('Firebase使用状況の更新に失敗:', e);
            });
          }
        }, 1000);
      } else {
        setSyncProgress({ show: false, progress: 0, stage: '' });
        showToast("同期に問題が発生しました。後でもう一度お試しください", "warning");
      }
      
      // スクロール位置を最後に復元
      restoreScrollPosition();
      
      console.log("同期処理が完了しました");
      return syncSuccess;
    } catch (error) {
      console.error("同期処理エラー:", error);
      showToast("データの同期に失敗しました", "error");
      setSyncProgress({ show: false, progress: 0, stage: '' });
      return false;
    }
  };

  // 勤務データをエクスポート
  const exportToExcel = useCallback((month: Date = currentDate) => {
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
    toggleModal('monthSelection', false);
  }, [attendanceData, currentDate, filterDataByMonth, showToast, toggleModal]);

  // 全データリセット
  const resetAllData = useCallback(() => {
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
  }, [showConfirm, showSuccess, showToast]);

  // 月次データをリセット
  const resetMonthData = useCallback((month: Date = currentDate) => {
    const targetMonth = format(month, "yyyy-MM");

    showConfirm(`${format(month, "yyyy年M月")}のデータのみをリセットしますか？この操作は元に戻せません。`, async () => {
      try {
        // まずローカルからデータを削除
        const newAttendanceData = attendanceData.filter(record => !record.date.startsWith(targetMonth));
        const newScheduleData = scheduleData.filter(schedule => !schedule.date.startsWith(targetMonth));
        
        // 状態を更新
        setAttendanceData(newAttendanceData);
        setScheduleData(newScheduleData);
        
        // ローカルストレージに保存
        safeLocalStorage.set(STORAGE_KEYS.ATTENDANCE_DATA, newAttendanceData);
        safeLocalStorage.set(STORAGE_KEYS.SCHEDULE_DATA, newScheduleData);
        
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
        toggleModal('monthSelection', false);
      } catch (error) {
        console.error("Error resetting month data:", error);
        showToast("データのリセットに失敗しました", "error");
      }
    });
  }, [attendanceData, currentDate, scheduleData, showConfirm, showSuccess, showToast, toggleModal]);

  // 予定の削除（改善版）
  const deleteSchedule = useCallback((scheduleId: string) => {
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
        toggleModal('schedule', false);
        setSelectedScheduleItem(null);
        
      } catch (error) {
        console.error('予定削除エラー:', error);
        showToast("予定の削除に失敗しました", "error");
      }
    });
  }, [scheduleData, showConfirm, showToast, toggleModal]);

  // 勤務区分を登録・更新
  const updateAttendanceRecord = async (employeeId: number, date: Date, workType: string) => {
    try {
      // ミニマルな進捗表示
      setSyncProgress({ show: true, progress: 0, stage: '勤務データ更新中...' });
      
      const dateStr = format(date, "yyyy-MM-dd");
      const employeeName = employees.find(emp => emp.id === employeeId)?.name;
      
      // データ更新処理
      const newAttendanceData = [...attendanceData]; // 配列をコピー
      
      // 既存データの削除
      const existingIndex = newAttendanceData.findIndex(
        record => record.employeeId === employeeId.toString() && record.date === dateStr
      );
      
      if (existingIndex !== -1) {
        newAttendanceData.splice(existingIndex, 1);
      }
      
      // 新しいレコードの追加（workTypeが指定されている場合のみ）
      if (workType) {
        const newRecord: AttendanceRecord = {
          employeeId: employeeId.toString(),
          date: dateStr,
          workType,
          employeeName
        };
        newAttendanceData.push(newRecord);
      }
      
      // 状態を更新（先に行うことでUIの応答性を向上）
      setAttendanceData(newAttendanceData);
      
      // 進捗コールバックの最適化
      let lastReportedProgress = 0;
      const optimizedCallback = (stage: string, progress: number) => {
        // 10%単位の進捗変化でのみ更新
        const scaledProgress = 20 + (progress * 0.8);
        if (Math.abs(scaledProgress - lastReportedProgress) >= 10 || progress === 100) {
          lastReportedProgress = scaledProgress;
          safeExecute(() => {
            setSyncProgress({ 
              show: true, 
              progress: Math.round(scaledProgress), 
              stage: `勤務データ: ${stage}` 
            });
          });
        }
      };
      
      // データを保存（最小限の進捗更新）
      setSyncProgress({ show: true, progress: 20, stage: 'データをストレージに保存中...' });
      
      const success = await StorageService.saveData(
        STORAGE_KEYS.ATTENDANCE_DATA, 
        newAttendanceData,
        optimizedCallback
      );
      
      // 保存結果の処理
      if (success) {
        setSyncProgress({ show: true, progress: 100, stage: '更新完了!' });
        
        // 短い遅延後に進捗表示を消す
        setTimeout(() => {
          safeExecute(() => {
            setSyncProgress({ show: false, progress: 0, stage: '' });
          });
        }, 800);
        
        // オンライン時のみフラグを下げる
        if (navigator.onLine && !isOffline) {
          setPendingChanges(false);
        } else {
          setPendingChanges(true);
        }
      } else {
        // エラー時の処理
        safeExecute(() => {
          setSyncProgress({ show: false, progress: 0, stage: '' });
          showToast("データの保存に失敗しました。同期ボタンで再同期してください", "warning");
        });
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

  // 一括更新用の勤務区分を適用
  const applyWorkTypeToCells = async (workType: string) => {
    if (!selectedCells.length || !workType) return;

    try {
      // 一括更新用のプログレスバー表示
      setSyncProgress({ show: true, progress: 0, stage: '勤務データ更新の準備中...' });
      
      // マップを使って効率的にデータを処理
      const recordMap = new Map<string, AttendanceRecord>();
      
      // 既存データをマップに入れる
      attendanceData.forEach(record => {
        const key = `${record.employeeId}_${record.date}`;
        recordMap.set(key, record);
      });
      
      // 新しいデータをマップに追加/更新
      selectedCells.forEach(cell => {
        const dateStr = format(cell.date, "yyyy-MM-dd");
        const key = `${cell.employeeId}_${dateStr}`;
        const employeeName = employees.find(emp => emp.id === cell.employeeId)?.name;
        
        // 新レコードを作成
        const newRecord: AttendanceRecord = {
          employeeId: cell.employeeId.toString(),
          date: dateStr,
          workType,
          employeeName
        };
        
        // マップに追加
        recordMap.set(key, newRecord);
      });
      
      // マップから配列に変換
      const newAttendanceData = Array.from(recordMap.values());
      
      // 進捗表示を更新
      setSyncProgress({ show: true, progress: 20, stage: 'データをストレージに保存中...' });
      
      // 状態を更新
      setAttendanceData(newAttendanceData);
      
      // 保存処理
      const success = await StorageService.saveData(
        STORAGE_KEYS.ATTENDANCE_DATA, 
        newAttendanceData,
        (stage, progress) => {
          // 進捗表示の更新
          setSyncProgress({ 
            show: true, 
            progress: 20 + Math.round(progress * 0.8), 
            stage: `勤務データ: ${stage}` 
          });
        }
      );
      
      // 結果処理
      if (success) {
        setSyncProgress({ show: true, progress: 100, stage: '更新完了!' });
        
        // 更新完了通知
        setTimeout(() => {
          safeExecute(() => {
            setSyncProgress({ show: false, progress: 0, stage: '' });
            showToast(`${selectedCells.length}件の勤務区分を一括更新しました`, "success");
          });
        }, 800);
        
        // オンライン時は同期済みフラグを設定
        setPendingChanges(!navigator.onLine);
      } else {
        setSyncProgress({ show: false, progress: 0, stage: '' });
        showToast("データの保存に失敗しました。後で同期ボタンを使用してください", "warning");
        setPendingChanges(true);
      }
      
      return true;
    } catch (error) {
      console.error('一括更新エラー:', error);
      showToast("勤務区分の一括更新に失敗しました", "error");
      setSyncProgress({ show: false, progress: 0, stage: '' });
      return false;
    }
  };

  // 勤務区分の削除（単一または一括）
  const deleteAttendanceRecords = async (targetCells: { employeeId: number, date: Date }[]) => {
    if (!targetCells.length) return false;

    try {
      setSyncProgress({ show: true, progress: 0, stage: '勤務データ削除中...' });
      
      // 削除対象以外のレコードだけを残す
      const newAttendanceData = attendanceData.filter(record => {
        return !targetCells.some(cell => 
          cell.employeeId.toString() === record.employeeId && 
          format(cell.date, "yyyy-MM-dd") === record.date
        );
      });
      
      // 状態を更新
      setAttendanceData(newAttendanceData);
      
      // 保存処理
      setSyncProgress({ show: true, progress: 50, stage: 'データを保存中...' });
      
      const success = await StorageService.saveData(
        STORAGE_KEYS.ATTENDANCE_DATA, 
        newAttendanceData,
        (stage, progress) => {
          setSyncProgress({ 
            show: true, 
            progress: 50 + (progress * 0.5), 
            stage: `勤務データ: ${stage}` 
          });
        }
      );
      
      // 結果処理
      if (success) {
        setSyncProgress({ show: true, progress: 100, stage: '削除完了!' });
        
        setTimeout(() => {
          safeExecute(() => {
            setSyncProgress({ show: false, progress: 0, stage: '' });
            showToast(`${targetCells.length}件の勤務区分を削除しました`, "success");
          });
        }, 800);
        
        setPendingChanges(!navigator.onLine);
        return true;
      } else {
        setSyncProgress({ show: false, progress: 0, stage: '' });
        showToast("データの保存に失敗しました。後で同期ボタンを使用してください", "warning");
        setPendingChanges(true);
        return false;
      }
    } catch (error) {
      console.error('勤務区分削除エラー:', error);
      showToast("勤務区分の削除に失敗しました", "error");
      setSyncProgress({ show: false, progress: 0, stage: '' });
      return false;
    }
  };

  //---------------------------------------------------------------
  // モーダルハンドラー関数
  //---------------------------------------------------------------
  // 勤務区分選択モーダルのハンドラー
  const handleWorkTypeModalSubmit = async () => {
    // 一括編集モードの場合
    if (isBulkEditMode && isAdminMode && selectedCells.length > 0) {
      if (!selectedWorkType) return;
      
      // UIブロッキングを防ぐため、先にモーダルを閉じる
      toggleModal('workType', false);
      setSelectedWorkType("");
      
      // 少し遅延させてから選択セルをクリア
      safeExecute(() => {
        setSelectedCells([]);
      }, 100);
      
      // 一括適用処理
      await applyWorkTypeToCells(selectedWorkType);
    } else if (selectedCell) {
      // 通常の編集モード
      if (!selectedWorkType) return;
      
      // モーダルを閉じて状態をリセット
      toggleModal('workType', false);
      
      // 変数をコピーして安全に処理
      const cellCopy = {...selectedCell};
      const workTypeCopy = selectedWorkType;
      
      setSelectedWorkType("");
      safeExecute(() => {
        setSelectedCell(null);
      }, 100);
      
      // 勤務区分を更新
      await updateAttendanceRecord(cellCopy.employeeId, cellCopy.date, workTypeCopy);
    }
  };

  // 勤務区分削除のハンドラー
  const handleWorkTypeModalDelete = () => {
    // 一括編集モードの場合
    if (isBulkEditMode && isAdminMode && selectedCells.length > 0) {
      showConfirm(`選択された${selectedCells.length}件の勤務区分を削除しますか？`, async () => {
        // モーダルを閉じて状態をリセット
        toggleModal('workType', false);
        
        // 削除処理を実行
        const cellsCopy = [...selectedCells];
        setSelectedCells([]);
        
        await deleteAttendanceRecords(cellsCopy);
      });
    } else if (selectedCell) {
      // 単一勤務区分の削除
      const cellCopy = {...selectedCell};
      
      showConfirm("この勤務区分を削除しますか？", async () => {
        // モーダルを閉じて状態をリセット
        toggleModal('workType', false);
        setSelectedCell(null);
        
        // 削除処理を実行
        await deleteAttendanceRecords([cellCopy]);
      });
    }
  };

  // スケジュールモーダルの保存ハンドラー
  const handleScheduleModalSubmit = async (
    title: string,
    details: string,
    color: string,
    isAllEmployees: boolean,
    selectedEmployees: string[]
  ) => {
    if (!title.trim() || !selectedScheduleDate) return;

    // 必要なデータをコピー
    const dateStr = format(selectedScheduleDate, "yyyy-MM-dd");
    const employeeIds = isAllEmployees ? [] : [...selectedEmployees];
    const isUpdate = selectedScheduleItem !== null;
    const selectedItemCopy = selectedScheduleItem ? {...selectedScheduleItem} : null;

    // モーダルを閉じてUI状態をリセット
    toggleModal('schedule', false);
    setSelectedScheduleDate(null);
    setSelectedScheduleItem(null);

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
                title: title.trim(), 
                details, 
                color, 
                employeeId: isAllEmployees ? "" : (employeeIds[0] || ""), // 後方互換性のため
                employeeIds 
              }
            : item
        );
      } else {
        // 新規予定を追加
        const newScheduleItem: ScheduleItem = {
          id: Date.now().toString(),
          employeeId: isAllEmployees ? "" : (employeeIds[0] || ""), // 後方互換性のため
          employeeIds,
          date: dateStr,
          title: title.trim(),
          details,
          color
        };
        
        newScheduleData = [...scheduleData, newScheduleItem];
      }
      
      // 状態を更新
      setScheduleData(newScheduleData);
      
      setSyncProgress({ show: true, progress: 20, stage: 'データをストレージに保存中...' });
      
      // 保存処理
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
      
      // 結果処理
      if (success) {
        setSyncProgress({ show: true, progress: 100, stage: '更新完了!' });
        
        setTimeout(() => {
          safeExecute(() => {
            setSyncProgress({ show: false, progress: 0, stage: '' });
            showToast(isUpdate ? "予定を更新しました" : "新しい予定を追加しました", "success");
          });
        }, 800);
        
        // オンライン時は同期済みフラグを設定
        setPendingChanges(!navigator.onLine);
      } else {
        setSyncProgress({ show: false, progress: 0, stage: '' });
        showToast("データの保存に失敗しました。同期ボタンで再同期してください", "warning");
        setPendingChanges(true);
      }
    } catch (error) {
      console.error('予定操作エラー:', error);
      showToast("予定の保存に失敗しました", "error");
      setSyncProgress({ show: false, progress: 0, stage: '' });
    }
  };

  // 月選択モーダルのアクションハンドラー
  const handleMonthSelectionAction = useCallback(() => {
    if (monthSelectionMode === "export") {
      exportToExcel(selectedMonth);
    } else {
      resetMonthData(selectedMonth);
    }
  }, [monthSelectionMode, selectedMonth, exportToExcel, resetMonthData]);

  //---------------------------------------------------------------
  // サブコンポーネント
  //---------------------------------------------------------------
  // オフライン表示コンポーネント
  const OfflineIndicator: React.FC = () => {
    return (
      <OfflineIndicatorComponent 
        isOffline={isOffline} 
        pendingChanges={pendingChanges} 
      />
    );
  };

  // 同期プログレスバーコンポーネント
  const SyncProgressBar: React.FC = () => {
    if (!syncProgress.show) return null;

    return (
      <div className="fixed inset-x-0 top-0 z-progress pointer-events-none">
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

  // 管理者設定トグル
  const AdminToggle: React.FC = () => {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white p-2 rounded-lg shadow-lg flex flex-col gap-2">
          <button
            onClick={() => {
              captureTableScroll();
              try {
                safeLocalStorage.set('_admin_toggle_scroll', {
                  x: window.scrollX,
                  y: window.scrollY,
                  table: globalScrollPosition,
                  time: Date.now()
                });
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
                captureTableScroll();
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

  // TableViewコンポーネント
  const TableView: React.FC = () => {
    // スクロール位置管理用のref
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const isScrollingRef = useRef(false);
    const scrollTimerRef = useRef<number | null>(null);

    // 月の日数を取得
    const daysInMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    ).getDate();

    // 日付の配列を生成
    const dates = useMemo(() => 
      Array.from({ length: daysInMonth }, (_, i) => 
        new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)
      ), [currentDate, daysInMonth]);

    // 勤務スコアを事前計算（パフォーマンス最適化）
    const employeeScores = useMemo(() => {
      const scores: Record<number, number> = {};
      employees.forEach(emp => {
        scores[emp.id] = calculateEmployeeWorkTypeScore(emp.id);
      });
      return scores;
    }, [calculateEmployeeWorkTypeScore]);

    // コンポーネントマウント時のスクロール位置復元
    useEffect(() => {
      if (tableContainerRef.current) {
        tableContainerGlobalRef.current = tableContainerRef.current;
        
        // 保存されたスクロール位置があれば復元
        const savedPos = safeLocalStorage.get<ScrollPosition>('_table_scroll_pos', { x: 0, y: 0 });
        if (savedPos.x || savedPos.y) {
          safeExecute(() => {
            if (tableContainerRef.current) {
              tableContainerRef.current.scrollLeft = savedPos.x;
              tableContainerRef.current.scrollTop = savedPos.y;
            }
          });
        }
        
        // スクロールイベントハンドラー（節約型）
        const handleScroll = () => {
          if (isScrollingRef.current) return;
          isScrollingRef.current = true;
          
          // 前回のタイマーをクリア
          if (scrollTimerRef.current) {
            window.clearTimeout(scrollTimerRef.current);
          }
          
          // 150msのスロットリングを適用
          scrollTimerRef.current = window.setTimeout(() => {
            if (tableContainerRef.current) {
              const newPos = {
                x: tableContainerRef.current.scrollLeft,
                y: tableContainerRef.current.scrollTop
              };
              
              // グローバル状態に保存
              setGlobalScrollPosition(newPos);
              
              // ローカルストレージにも保存（頻度を抑える）
              safeLocalStorage.set('_table_scroll_pos', newPos);
            }
            isScrollingRef.current = false;
          }, 150);
        };
        
        const tableContainer = tableContainerRef.current;
        tableContainer.addEventListener('scroll', handleScroll, { passive: true });
        
        return () => {
          if (tableContainer) {
            tableContainer.removeEventListener('scroll', handleScroll);
          }
          if (scrollTimerRef.current) {
            window.clearTimeout(scrollTimerRef.current);
          }
        };
      }
    }, []);

    // セル選択処理の最適化版
    const handleCellClick = useCallback((e: React.MouseEvent, employeeId: number, date: Date) => {
      // イベント伝播を停止
      e.preventDefault();
      e.stopPropagation();

      // スクロール位置を記憶
      rememberScrollPosition();

      // UI更新を行う
      if (isBulkEditMode && isAdminMode) {
        toggleCellSelection(employeeId, date, e.ctrlKey || isCtrlPressed);
      } else {
        setSelectedCell({ employeeId, date });
        setSelectedWorkType(getEmployeeWorkTypeForDate(employeeId, date) || "");
        toggleModal('workType', true);
      }
    }, [isBulkEditMode, isAdminMode, isCtrlPressed, rememberScrollPosition, toggleCellSelection, getEmployeeWorkTypeForDate, toggleModal]);

    // 週単位でセルを選択
    const selectWeekCells = useCallback((employeeId: number, startDate: Date) => {
      if (!isBulkEditMode || !isAdminMode) return;
      
      // スクロール位置を記憶
      rememberScrollPosition();
      
      // 週の開始日（日曜日）から終了日（土曜日）を計算
      const startOfWeek = new Date(startDate);
      startOfWeek.setDate(startDate.getDate() - startDate.getDay());
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      // 当月の日付のみを対象に週の日付を取得
      const weekDates: Date[] = [];
      let current = new Date(startOfWeek);
      
      while (current <= endOfWeek) {
        if (current.getMonth() === startDate.getMonth()) {
          weekDates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }
      
      // 既存の選択に追加または置き換え
      safeExecute(() => {
        if (isMobileSelectMode || isCtrlPressed) {
          // 既存の選択に追加（重複を除外）
          setSelectedCells(prev => {
            const newSelections = weekDates.map(date => ({ employeeId, date }));
            const filteredNewSelections = newSelections.filter(
              newSel => !prev.some(
                existSel => 
                  existSel.employeeId === newSel.employeeId && 
                  existSel.date.getTime() === newSel.date.getTime()
              )
            );
            return [...prev, ...filteredNewSelections];
          });
        } else {
          // 選択を置き換え
          setSelectedCells(weekDates.map(date => ({ employeeId, date })));
        }
      });
    }, [isBulkEditMode, isAdminMode, isMobileSelectMode, isCtrlPressed, rememberScrollPosition]);

    // スケジュール表示処理
    const handleScheduleClick = useCallback((e: React.MouseEvent, date: Date, schedule: ScheduleItem) => {
      e.stopPropagation();
      e.preventDefault();
      
      rememberScrollPosition();
      
      safeExecute(() => {
        setSelectedScheduleDate(date);
        setSelectedScheduleItem(schedule);
        toggleModal('schedule', true);
      });
    }, [rememberScrollPosition, toggleModal]);

    return (
      <div className="flex flex-col h-full">
        <div className="mb-4 flex justify-between items-center flex-wrap gap-2">
          <div className="flex gap-2 items-center flex-wrap">
            <select
              id="employee-selector"
              name="employee-selector"
              value={selectedEmployee}
              onChange={(e) => {
                rememberScrollPosition();
                const newValue = e.target.value;
                safeExecute(() => setSelectedEmployee(newValue));
              }}
              className="w-64 p-2 border rounded modal-select"
              style={{ 
                fontSize: '16px', 
                WebkitAppearance: 'menulist', 
                appearance: 'menulist',
                display: 'block',
                opacity: 1,
                visibility: 'visible'
              }}
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
                  className={`px-3 py-1 rounded touch-fix ${
                    isBulkEditMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                  }`}
                  style={{ minHeight: '44px' }}
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
                      className="px-3 py-1 rounded bg-gray-200 touch-fix"
                      disabled={selectedCells.length === 0}
                      style={{ minHeight: '44px' }}
                    >
                      選択解除 {selectedCells.length > 0 && `(${selectedCells.length})`}
                    </button>
                    
                    <button
                      onClick={() => {
                        rememberScrollPosition();
                        setIsMobileSelectMode(!isMobileSelectMode);
                      }}
                      className={`px-3 py-1 rounded touch-fix ${
                        isMobileSelectMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                      } text-sm md:text-base`}
                      style={{ minHeight: '44px' }}
                    >
                      {isMobileSelectMode ? '複数選択モード：オン' : '複数選択モードに切り替え'}
                    </button>
                    
                    {selectedCells.length > 0 && (
                      <button
                        onClick={() => {
                          rememberScrollPosition();
                          setSelectedWorkType("");
                          toggleModal('workType', true);
                        }}
                        className="px-3 py-1 rounded bg-blue-500 text-white touch-fix"
                        style={{ minHeight: '44px' }}
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
                        <span className="block text-xs"></span>
                          {['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}
                          <>
                          {isJapaneseHoliday(date) && (
                            <span className="block truncate text-xs">
                              {getHolidayName(date)}
                       </span>
                          )}
                      {selectedEmployee && (
                        <div className="text-xs">
                          {Object.entries(calculateDailySummary(date)).map(([type, count]) => (
                            <div key={type} className="truncate">
                              {workTypes.find(w => w.id === type)?.label}: {count}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  </div>
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
                            ${isBulkEditMode && isAdminMode ? 'cursor-pointer hover:bg-gray-100 touch-fix' : ''}
                          `}
                          onClick={(e) => {
                            if (isBulkEditMode && isAdminMode) {
                              e.preventDefault();
                              e.stopPropagation();
                              
                              rememberScrollPosition();
                              
                              safeExecute(() => {
                                if (selectedCount === dates.length) {
                                  clearSelectionForEmployee(employee.id);
                                } else {
                                  selectAllCellsForEmployee(employee.id);
                                }
                              });
                            }
                          }}
                          style={{ minHeight: '44px' }}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center">
                              <span>{employee.name}</span>
                              <span className="ml-2 text-sm font-semibold text-blue-600">
                                {employeeScores[employee.id].toFixed(1)}
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
                          const workType = getEmployeeWorkTypeForDate(employee.id, date);
                          const schedules = getEmployeeScheduleForDate(employee.id, date);
                          const isSelected = isCellSelected(employee.id, date);
                          
                          return (
                            <td
                              key={`${employee.id}-${date.getTime()}`}
                              className={`
                                border p-2 cursor-pointer text-center relative touch-fix
                                ${getCellBackgroundColor(date).bg}
                                ${getCellBackgroundColor(date).hover}
                                ${isBulkEditMode && isAdminMode && isSelected ? 'bg-blue-100 border-2 border-blue-500' : ''}
                              `}
                              onClick={(e) => handleCellClick(e, employee.id, date)}
                              onDoubleClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (isBulkEditMode && isAdminMode) {
                                  selectWeekCells(employee.id, date);
                                }
                              }}
                              style={{ minHeight: '44px' }}
                            >
                              <div className="min-h-[40px] flex flex-col items-center justify-center">
                                <div className="font-medium">
                                  {workType && workTypes.find(w => w.id === workType)?.label}
                                </div>
                                
                                {schedules.length > 0 && (
                                  <div className="w-full mt-1">
                                    {schedules.slice(0, 2).map(schedule => (
                                      <div 
                                        key={schedule.id}
                                        className="text-xs px-1 py-0.5 rounded truncate text-white touch-fix"
                                        style={{ backgroundColor: schedule.color || '#4A90E2' }}
                                        title={schedule.title}
                                        onClick={(e) => handleScheduleClick(e, date, schedule)}
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
  };

  // CalendarViewコンポーネント
  const CalendarView: React.FC = () => {
    // カレンダー要素のref
    const calendarRef = useRef<HTMLDivElement>(null);
    
    // 日付クリック処理
    const handleDateClick = useCallback((date: Date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const records = attendanceData.filter(
        (record) => record.date === dateStr
      );
      setSelectedDateDetails({ date, records });
      toggleModal('attendanceDetail', true);
    }, [attendanceData, toggleModal]);
    
    // 予定追加ボタンクリック処理
    const handleAddSchedule = useCallback((e: React.MouseEvent, date: Date) => {
      e.preventDefault();
      e.stopPropagation();
      
      safeExecute(() => {
        setSelectedScheduleDate(date);
        setSelectedScheduleItem(null);
        toggleModal('schedule', true);
      }, 10);
    }, [toggleModal]);

    // 予定クリック処理
    const handleScheduleClick = useCallback((e: React.MouseEvent, date: Date, schedule: ScheduleItem) => {
      e.preventDefault();
      e.stopPropagation();
      
      safeExecute(() => {
        setSelectedScheduleDate(date);
        setSelectedScheduleItem(schedule);
        toggleModal('schedule', true);
      }, 10);
    }, [toggleModal]);

    // カレンダー日付データをメモ化
    const calendarDates = useMemo(() => 
      generateCalendarDates(currentDate.getFullYear(), currentDate.getMonth()),
      [currentDate, generateCalendarDates]
    );

    return (
      <div className="p-4" ref={calendarRef}>
        <div className="calendar-grid">
          {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
            <div key={day} className="calendar-header">
              {day}
            </div>
          ))}
          {calendarDates.map(({ date, isCurrentMonth }) => {
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
                    onClick={(e) => handleAddSchedule(e, date)}
                    className="text-gray-500 hover:text-blue-500 p-1 relative z-30 bg-white/70 rounded-full touch-fix"
                    style={{ minHeight: '30px', minWidth: '30px' }}
                    title="予定を追加"
                    type="button"
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
                
                {/* 勤務区分の集計 */}
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
                <div className="text-xs space-y-1 mt-2 relative z-20">
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
                        onClick={(e) => handleScheduleClick(e, date, schedule)}
                        title={`${schedule.title}${schedule.details ? ` - ${schedule.details}` : ''} (${employeeText})`}
                      >
                        {schedule.title}
                      </div>
                    );
                  })}
                </div>
                
                {/* 勤務詳細を見るためのクリックイベント */}
                <div 
                  className="absolute inset-0 cursor-pointer z-10"
                  onClick={() => handleDateClick(date)}
                ></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 単一従業員カレンダービュー
  const SingleEmployeeCalendarView: React.FC = () => {
    // スクロール位置管理
    const calendarContainerRef = useRef<HTMLDivElement>(null);
    const [scrollPosition, setScrollPosition] = useState({ x: 0, y: 0 });

    // 選択された従業員がいない場合は何も表示しない
    if (!selectedEmployee) return null;

    const employeeId = parseInt(selectedEmployee);
    const employeeName = employees.find(emp => emp.id === employeeId)?.name || "従業員";

    // スクロール位置を記憶
    const rememberScrollPositionLocal = () => {
      setScrollPosition({
        x: window.scrollX || 0,
        y: window.scrollY || 0
      });
    };

    // カレンダー日付データをメモ化
    const calendarDates = useMemo(() => 
      generateCalendarDates(currentDate.getFullYear(), currentDate.getMonth()),
      [currentDate, generateCalendarDates]
    );

    // 日付セルクリック処理
    const handleCellClick = useCallback((e: React.MouseEvent, date: Date) => {
      if (!isSameMonth(date, currentDate)) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      rememberScrollPositionLocal();
      
      safeExecute(() => {
        if (isBulkEditMode && isAdminMode) {
          toggleCellSelection(employeeId, date, e.ctrlKey || isCtrlPressed);
        } else {
          setSelectedCell({ employeeId, date });
          setSelectedWorkType(getEmployeeWorkTypeForDate(employeeId, date) || "");
          toggleModal('workType', true);
        }
      });
    }, [currentDate, employeeId, isBulkEditMode, isAdminMode, isCtrlPressed, getEmployeeWorkTypeForDate, toggleCellSelection, toggleModal]);

    // 予定クリック処理
    const handleScheduleClick = useCallback((e: React.MouseEvent, date: Date, schedule: ScheduleItem) => {
      e.preventDefault();
      e.stopPropagation();
      
      rememberScrollPositionLocal();
      
      safeExecute(() => {
        setSelectedScheduleDate(date);
        setSelectedScheduleItem(schedule);
        toggleModal('schedule', true);
      });
    }, [toggleModal]);

    // スクロール位置復元
    useEffect(() => {
      if (scrollPosition.x !== 0 || scrollPosition.y !== 0) {
        safeExecute(() => {
          window.scrollTo(scrollPosition.x, scrollPosition.y);
        });
      }
    }, [modalState.workType, modalState.schedule, scrollPosition]);

    return (
      <div className="p-4" ref={calendarContainerRef}>
        <div className="mb-4 flex gap-2 items-center flex-wrap">
          <select
            value={selectedEmployee}
            onChange={(e) => {
              rememberScrollPositionLocal();
              const newValue = e.target.value;
              safeExecute(() => setSelectedEmployee(newValue));
            }}
            className="w-64 p-2 border rounded modal-select"
            style={{ 
              fontSize: '16px', 
              WebkitAppearance: 'menulist', 
              appearance: 'menulist',
              display: 'block',
              opacity: 1,
              visibility: 'visible'
            }}
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
                  rememberScrollPositionLocal();
                  setIsBulkEditMode(!isBulkEditMode);
                  if (!isBulkEditMode) {
                    setSelectedCells([]);
                  }
                }}
                className={`px-3 py-1 rounded touch-fix ${
                  isBulkEditMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                }`}
                style={{ minHeight: '44px' }}
              >
                {isBulkEditMode ? '一括編集中' : '一括編集'}
              </button>
              
              {isBulkEditMode && (
                <>
                  <button
                    onClick={() => {
                      rememberScrollPositionLocal();
                      setSelectedCells([]);
                    }}
                    className="px-3 py-1 rounded bg-gray-200 touch-fix"
                    disabled={selectedCells.length === 0}
                    style={{ minHeight: '44px' }}
                  >
                    選択解除 {selectedCells.length > 0 && `(${selectedCells.length})`}
                  </button>
                  
                  <button
                    onClick={() => {
                      rememberScrollPositionLocal();
                      setIsMobileSelectMode(!isMobileSelectMode);
                    }}
                    className={`px-3 py-1 rounded touch-fix ${
                      isMobileSelectMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                    } text-sm md:text-base`}
                    style={{ minHeight: '44px' }}
                  >
                    {isMobileSelectMode ? '複数選択モード：オン' : '複数選択モードに切り替え'}
                  </button>
                  
                  {selectedCells.length > 0 && (
                    <button
                      onClick={() => {
                        rememberScrollPositionLocal();
                        setSelectedWorkType("");
                        toggleModal('workType', true);
                      }}
                      className="px-3 py-1 rounded bg-blue-500 text-white touch-fix"
                      style={{ minHeight: '44px' }}
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
          {calendarDates.map(({ date, isCurrentMonth }) => {
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
                  isSelected ? 'bg-blue-100 border-2 border-blue-500' : ''
                } ${
                  isCurrentMonth && shouldShowWarning(date) ? "bg-warning-red" : ""
                } touch-fix`}
                onClick={(e) => handleCellClick(e, date)}
              >
                <div className="flex justify-between items-start">
                  <div className="font-bold">
                    {date.getDate()}
                  </div>
                  <div className="text-xs">
                    {['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}
                  </div>
                </div>
                
                {/* 祝日名 */}
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
                  <div className="text-xs space-y-1 mt-2 relative z-20">
                    {schedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="p-1 rounded text-white truncate cursor-pointer touch-fix"
                        style={{ backgroundColor: schedule.color || '#4A90E2' }}
                        onClick={(e) => handleScheduleClick(e, date, schedule)}
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
  };
  
  // 勤務区分選択モーダル
  const WorkTypeSelectionModal: React.FC = () => {
    const selectRef = useRef<HTMLSelectElement>(null);
    const modalInitializedRef = useRef<boolean>(false);

    // モーダル表示時の初期化処理
    useEffect(() => {
      if (!getModalState('workType')) {
        modalInitializedRef.current = false;
        return;
      }

      if (modalInitializedRef.current) return;
      modalInitializedRef.current = true;
      
      // スクロール位置を記録
      safeLocalStorage.set('_modal_scroll_pos', {
        y: window.scrollY || document.documentElement.scrollTop,
        time: Date.now()
      });
      
      // セレクトボックスにフォーカス
      safeExecute(() => {
        if (selectRef.current) {
          selectRef.current.focus();
        }
      }, 300);
    }, [modalState.workType, selectedCell]);

    return (
      <Modal
        isOpen={getModalState('workType')}
        onClose={() => {
          toggleModal('workType', false);
          safeExecute(() => {
            setSelectedCell(null);
            if (isBulkEditMode && isAdminMode) {
              setSelectedCells([]);
            }
          }, 100);
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
            ref={selectRef}
            value={selectedWorkType}
            onChange={(e) => setSelectedWorkType(e.target.value)}
            className="w-full p-2 border rounded mb-4 modal-select"
            style={{ 
              fontSize: '16px', 
              WebkitAppearance: 'menulist', 
              appearance: 'menulist',
              display: 'block',
              visibility: 'visible',
              opacity: 1,
              backgroundColor: 'white',
              color: 'black'
            }}
          >
            <option value="">選択してください</option>
            {workTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2 mt-6">
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
                onClick={handleWorkTypeModalDelete}
                className="px-4 py-3 bg-red-500 text-white rounded hover:bg-red-600 touch-fix"
                style={{ minHeight: '44px' }}
              >
                削除
              </button>
            )}
            <button
              onClick={() => {
                toggleModal('workType', false);
                safeExecute(() => {
                  setSelectedCell(null);
                  if (isBulkEditMode && isAdminMode) {
                    setSelectedCells([]);
                  }
                }, 100);
              }}
              className="px-4 py-3 bg-gray-200 rounded hover:bg-gray-300 touch-fix"
              style={{ minHeight: '44px' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleWorkTypeModalSubmit}
              className="px-4 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 touch-fix"
              disabled={!selectedWorkType}
              style={{ minHeight: '44px', opacity: selectedWorkType ? 1 : 0.5 }}
            >
              {isBulkEditMode && isAdminMode && selectedCells.length > 0 ? "一括適用" : "登録"}
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // 日付詳細モーダル
  const AttendanceDetailModal: React.FC = () => {
    if (!selectedDateDetails) return null;

    return (
      <Modal
        isOpen={getModalState('attendanceDetail')}
        onClose={() => toggleModal('attendanceDetail', false)}
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
                        // 従業員リストの順序で表示
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
                                    toggleModal('attendanceDetail', false);
                                    setSelectedWorkType(record.workType);
                                    toggleModal('workType', true);
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
                  if (schedule.employeeIds.length === 1) {
                    const emp = employees.find(e => e.id.toString() === schedule.employeeIds[0]);
                    employeeText = emp ? emp.name : "不明";
                  } else {
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
                          toggleModal('attendanceDetail', false);
                          toggleModal('schedule', true);
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
                  toggleModal('attendanceDetail', false);
                  toggleModal('schedule', true);
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

  // 予定追加・編集モーダル
  const ScheduleModal: React.FC = () => {
    const [title, setTitle] = useState("");
    const [details, setDetails] = useState("");
    const [color, setColor] = useState(PRESET_COLORS[0].value);
    const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
    const [isAllEmployees, setIsAllEmployees] = useState(true);
    const titleInputRef = useRef<HTMLInputElement>(null);

    // 編集モードの初期化
    useEffect(() => {
      if (selectedScheduleItem) {
        setTitle(selectedScheduleItem.title);
        setDetails(selectedScheduleItem.details || "");
        setColor(selectedScheduleItem.color || PRESET_COLORS[0].value);
        
        // 既存データの互換性対応
        if (selectedScheduleItem.employeeIds && selectedScheduleItem.employeeIds.length > 0) {
          setSelectedEmployees(selectedScheduleItem.employeeIds);
          setIsAllEmployees(selectedScheduleItem.employeeIds.length === 0);
        } else {
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
      
      // フォーカス設定
      if (getModalState('schedule')) {
        safeExecute(() => {
          if (titleInputRef.current) {
            titleInputRef.current.focus();
          }
        }, 100);
      }
    }, [selectedScheduleItem, modalState.schedule]);

    // 従業員選択切り替え
    const handleEmployeeToggle = (employeeId: string) => {
      if (isAllEmployees) return;
      
      setSelectedEmployees(prev => {
        if (prev.includes(employeeId)) {
          return prev.filter(id => id !== employeeId);
        } else {
          return [...prev, employeeId];
        }
      });
    };

    // 予定保存
    const handleSubmit = () => {
      handleScheduleModalSubmit(
        title,
        details,
        color,
        isAllEmployees,
        selectedEmployees
      );
    };

    return (
      <Modal
        isOpen={getModalState('schedule')}
        onClose={() => {
          toggleModal('schedule', false);
          setSelectedScheduleDate(null);
          setSelectedScheduleItem(null);
        }}
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
              <div className="flex items-center mb-2 touch-fix">
                <input
                  type="checkbox"
                  id="allEmployees"
                  checked={isAllEmployees}
                  onChange={(e) => setIsAllEmployees(e.target.checked)}
                  className="mr-2"
                  style={{ minWidth: '20px', minHeight: '20px' }}
                />
                <label 
                  htmlFor="allEmployees" 
                  className="text-sm font-medium touch-fix"
                  style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
                >
                  全員共通
                </label>
              </div>
              
              {!isAllEmployees && (
                <div className="max-h-40 overflow-y-auto border rounded p-2 overscroll-behavior-y: contain;">
                  {employees.map(emp => (
                    <div key={emp.id} className="flex items-center my-1 touch-fix">
                      <input
                        type="checkbox"
                        id={`emp-${emp.id}`}
                        checked={selectedEmployees.includes(emp.id.toString())}
                        onChange={() => handleEmployeeToggle(emp.id.toString())}
                        className="mr-2"
                        style={{ minWidth: '20px', minHeight: '20px' }}
                      />
                      <label 
                        htmlFor={`emp-${emp.id}`} 
                        className="text-sm touch-fix"
                        style={{ minHeight: '40px', display: 'flex', alignItems: 'center', paddingTop: '8px', paddingBottom: '8px' }}
                      >
                        {emp.name}
                      </label>
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
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border rounded modal-input"
              placeholder="予定のタイトル"
              style={{ fontSize: '16px' }}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">詳細</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full p-2 border rounded modal-textarea"
              rows={3}
              placeholder="予定の詳細（任意）"
              style={{ fontSize: '16px' }}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">色</label>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {PRESET_COLORS.map((colorOption) => (
                <button
                  key={colorOption.value}
                  type="button"
                  className={`w-full h-10 rounded-md touch-fix ${color === colorOption.value ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                  style={{ backgroundColor: colorOption.value, minHeight: '44px' }}
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
                style={{ minHeight: '44px', minWidth: '44px' }}
              />
              <span className="text-sm">カスタム色</span>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            {selectedScheduleItem && (
              <button
                onClick={() => deleteSchedule(selectedScheduleItem.id)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 touch-fix"
                style={{ minHeight: '44px' }}
              >
                削除
              </button>
            )}
            <button
              onClick={() => {
                toggleModal('schedule', false);
                setSelectedScheduleDate(null);
                setSelectedScheduleItem(null);
              }}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 touch-fix"
              style={{ minHeight: '44px' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 touch-fix"
              disabled={!title.trim() || (!isAllEmployees && selectedEmployees.length === 0)}
              style={{ 
                minHeight: '44px', 
                opacity: (!title.trim() || (!isAllEmployees && selectedEmployees.length === 0)) ? 0.5 : 1 
              }}
            >
              {selectedScheduleItem ? "更新" : "追加"}
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // 月選択モーダル
  const MonthSelectionModal: React.FC = () => {
    const [selectedYear, setSelectedYear] = useState<number>(selectedMonth.getFullYear());
    const [selectedMonthNumber, setSelectedMonthNumber] = useState<number>(selectedMonth.getMonth() + 1);
    
    const availableYears = useMemo(() => getAvailableYears(), []);
    const availableMonths = useMemo(() => getAvailableMonthsInYear(), []);
    
    // 選択した年月で selectedMonth を更新
    useEffect(() => {
      setSelectedMonth(new Date(selectedYear, selectedMonthNumber - 1, 1));
    }, [selectedYear, selectedMonthNumber]);

    return (
      <Modal
        isOpen={getModalState('monthSelection')}
        onClose={() => toggleModal('monthSelection', false)}
        title={monthSelectionMode === "export" ? "勤務データをエクスポート" : "月次データリセット"}
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              年月を選択してください
            </label>
            <div className="flex gap-2">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-1/2 p-2 border rounded modal-select"
                style={{ 
                  fontSize: '16px', 
                  WebkitAppearance: 'menulist', 
                  appearance: 'menulist'
                }}
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}年
                  </option>
                ))}
              </select>
              <select
                value={selectedMonthNumber}
                onChange={(e) => setSelectedMonthNumber(Number(e.target.value))}
                className="w-1/2 p-2 border rounded modal-select"
                style={{ 
                  fontSize: '16px', 
                  WebkitAppearance: 'menulist', 
                  appearance: 'menulist'
                }}
              >
                {availableMonths.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
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
              onClick={() => toggleModal('monthSelection', false)}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 touch-fix"
              style={{ minHeight: '44px' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleMonthSelectionAction}
              className={`px-4 py-2 ${
                monthSelectionMode === "export" 
                  ? "bg-blue-500 hover:bg-blue-600" 
                  : "bg-red-500 hover:bg-red-600"
              } text-white rounded touch-fix`}
              style={{ minHeight: '44px' }}
            >
              {monthSelectionMode === "export" ? "エクスポート" : "リセット"}
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // ストレージ使用状況モーダル
  const StorageUsageModal: React.FC = () => {
    if (!storageUsageData) return null;
    
    return (
      <Modal
        isOpen={getModalState('storageUsage')}
        onClose={() => toggleModal('storageUsage', false)}
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
              onClick={() => toggleModal('storageUsage', false)}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              閉じる
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // メインレンダリング
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
                    if (selectedEmployee) {
                      setCurrentView("singleEmployeeCalendar");
                    } else {
                      setCurrentView("table");
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
                
                {/* 管理者操作ボタン */}
                {isAdminMode && (
                  <>
                    <button
                      onClick={() => showMonthSelection("export")}
                      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      勤務データをエクスポート
                    </button>
                    
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
                  </>
                )}
              </div>
            </div>
            
            {/* メインコンテンツ表示 */}
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

            {/* モーダル群 */}
            <WorkTypeSelectionModal />
            <AttendanceDetailModal />
            <ScheduleModal />
            <StorageUsageModal />
            <MonthSelectionModal />
            <ConfirmModal
              isOpen={getModalState('confirm')}
              onClose={() => toggleModal('confirm', false)}
              onConfirm={confirmModalAction}
              message={confirmModalMessage}
            />
            <SuccessModal
              isOpen={getModalState('success')}
              onClose={() => toggleModal('success', false)}
              message={successMessage}
            />
            
            {/* 管理者設定ボタン */}
            <AdminToggle />
            
            {/* オフライン通知とデータ同期ボタン */}
            <SyncButton 
              onClick={syncChanges} 
              isVisible={navigator.onLine && pendingChanges} 
            />
            <OfflineIndicator />
            
            {/* 同期プログレスバー */}
            <SyncProgressBar />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AttendanceApp;