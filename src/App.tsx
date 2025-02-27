// src/App.tsx

import React, { useState, useEffect, useRef } from "react";
import { format, parse, isSameMonth } from "date-fns";
import * as XLSX from "xlsx";
import JapaneseHolidays from "japanese-holidays";
import Modal from "./components/Modal";
import ConfirmModal from "./components/ConfirmModal";
import SuccessModal from "./components/SuccessModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { StorageService, STORAGE_KEYS } from "./services/storage";
import "./index.css"; // スタイルを適用するためのCSSファイル

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
interface AttendanceRecord {
  employeeId: string;
  date: string;
  workType: string;
  employeeName?: string;
}

// 予定
interface ScheduleItem {
  id: string;
  employeeId: string;
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
  { id: 17, name: "藤田　向陽" },
  { id: 18, name: "若木　雄太" },
  { id: 19, name: "中谷　優衣" },
  { id: 20, name: "濱田　泰陽" },
  { id: 21, name: "佐々木　幹也" },
  { id: 22, name: "前田　愛都" },
  { id: 23, name: "益田　幸枝" },
  { id: 24, name: "井上　真理子" },
  { id: 25, name: "斎藤さん" },
  { id: 26, name: "越野　裕太" },
  { id: 27, name: "北大非常勤" }
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
  { id: "a3/P", label: "a3/P" },
  { id: "A/p1", label: "A/p1" },
  { id: "A/p2", label: "A/p2" },
  { id: "A/p3", label: "A/p3" },
  { id: "日", label: "日" },
  { id: "遅1", label: "遅1" },
  { id: "遅2", label: "遅2" },
  { id: "早1", label: "早1" },
  { id: "早2", label: "早2" },
  { id: "半1", label: "半1" },
  { id: "半5", label: "半5" },
  { id: "短", label: "短" },
  { id: "短土", label: "短土" },
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
  //---------------------------------------------------------------
  // 副作用（useEffect）
  //---------------------------------------------------------------
  // データの初期化を非同期で行う
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      try {
        // 非同期でFirebaseからデータを取得
        const attendance = await StorageService.getDataAsync<AttendanceRecord[]>(
          STORAGE_KEYS.ATTENDANCE_DATA, []
        );
        setAttendanceData(attendance);
        
        const schedule = await StorageService.getDataAsync<ScheduleItem[]>(
          STORAGE_KEYS.SCHEDULE_DATA, []
        );
        setScheduleData(schedule);
        
        // その他の設定も非同期で取得
        const currentView = await StorageService.getDataAsync<View>(
          STORAGE_KEYS.CURRENT_VIEW, "calendar"
        );
        setCurrentView(currentView);
        
        const savedDateStr = await StorageService.getDataAsync<string>(
          STORAGE_KEYS.CURRENT_DATE, ""
        );
        if (savedDateStr) {
          setCurrentDate(new Date(savedDateStr));
        }
        
        const selectedEmp = await StorageService.getDataAsync<string>(
          STORAGE_KEYS.SELECTED_EMPLOYEE, ""
        );
        setSelectedEmployee(selectedEmp);
        
        const adminMode = await StorageService.getDataAsync<boolean>(
          STORAGE_KEYS.ADMIN_MODE, false
        );
        setIsAdminMode(adminMode);
        
        // Firebase使用状況を取得
        try {
          const firebaseStorage = await StorageService.getFirebaseStorageInfo();
          if (firebaseStorage) {
            setFirebaseStorageInfo(firebaseStorage);
          }
        } catch (storageError) {
          console.error("Error getting Firebase storage info:", storageError);
        }
      } catch (error) {
        console.error("Error initializing data:", error);
        showToast("データの読み込みに失敗しました", "error");
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
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown as any);
      window.removeEventListener('keyup', handleKeyUp as any);
    };
  }, []);

  // オンライン/オフライン状態検出
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      // オンラインに戻ったらデータを同期
      syncChanges();
    };
    
    const handleOffline = () => {
      setIsOffline(true);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // 初期状態チェック
    setIsOffline(!navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 管理者モード変更時の一括編集モード初期化
  useEffect(() => {
    if (!isAdminMode) {
      setIsBulkEditMode(false);
      setSelectedCells([]);
      setIsMobileSelectMode(false);
    }
  }, [isAdminMode]);

  // 状態変更時のLocalStorage保存
  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.CURRENT_VIEW, currentView);
  }, [currentView]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.CURRENT_DATE, currentDate.toISOString());
  }, [currentDate]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.SELECTED_EMPLOYEE, selectedEmployee);
    // 従業員が選択されたら、singleEmployeeCalendar ビューに切り替える
    if (selectedEmployee && currentView === "table") {
      setCurrentView("singleEmployeeCalendar");
    } else if (!selectedEmployee && currentView === "singleEmployeeCalendar") {
      setCurrentView("table");
    }
  }, [selectedEmployee, currentView]);

  useEffect(() => {
    if (attendanceData.length > 0) {
      StorageService.saveData(STORAGE_KEYS.ATTENDANCE_DATA, attendanceData);
    }
  }, [attendanceData]);

  useEffect(() => {
    if (scheduleData.length > 0) {
      StorageService.saveData(STORAGE_KEYS.SCHEDULE_DATA, scheduleData);
    }
  }, [scheduleData]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.ADMIN_MODE, isAdminMode);
  }, [isAdminMode]);

  // データ変更を検知してpendingChangesフラグを設定
  useEffect(() => {
    if (attendanceData.length > 0 || scheduleData.length > 0) {
      setPendingChanges(true);
    }
  }, [attendanceData, scheduleData]);

  // ストレージ使用状況の確認
  useEffect(() => {
    // 管理者モードがオンになった時に使用状況を確認
    if (isAdminMode) {
      const warning = StorageService.checkStorageWarning(70);
      if (warning) {
        showToast(warning, "warning");
      }
      
      // Firebase使用状況を更新
      StorageService.getFirebaseStorageInfo().then(info => {
        if (info) {
          setFirebaseStorageInfo(info);
        }
      }).catch(error => {
        console.error("Error updating Firebase storage info:", error);
      });
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

  //---------------------------------------------------------------
  // ヘルパー関数
  //---------------------------------------------------------------
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

  // 変更データの同期
  const syncChanges = async () => {
    if (!pendingChanges) return;
    
    try {
      // 勤怠データの同期
      await StorageService.saveData(STORAGE_KEYS.ATTENDANCE_DATA, attendanceData);
      // 予定データの同期
      await StorageService.saveData(STORAGE_KEYS.SCHEDULE_DATA, scheduleData);
      
      setPendingChanges(false);
      showToast("データを同期しました", "success");
      
      // Firebase使用状況を更新
      if (isAdminMode) {
        const info = await StorageService.getFirebaseStorageInfo();
        if (info) {
          setFirebaseStorageInfo(info);
        }
      }
    } catch (error) {
      console.error("Error syncing data:", error);
      showToast("データの同期に失敗しました", "error");
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
    const records = attendanceData.filter((record) => record.date === dateStr);

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
        (schedule.employeeId === employeeId.toString() || schedule.employeeId === "")
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
  const updateAttendanceRecord = (employeeId: number, date: Date, workType: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const newAttendanceData = attendanceData.filter(
      record => !(record.employeeId === employeeId.toString() && record.date === dateStr)
    );
    
    const employeeName = employees.find(emp => emp.id === employeeId)?.name;
    
    if (workType) {
      const newRecord: AttendanceRecord = {
        employeeId: employeeId.toString(),
        date: dateStr,
        workType,
        employeeName
      };
      newAttendanceData.push(newRecord);
    }
    
    setAttendanceData(newAttendanceData);
    return newAttendanceData;
  };
  //---------------------------------------------------------------
  // データ操作関数
  //---------------------------------------------------------------
  // 勤務データをエクスポート
  const exportToExcel = () => {
    const data = attendanceData.map((record) => ({
      従業員名: employees.find((emp) => emp.id.toString() === record.employeeId)?.name,
      日付: record.date,
      勤務区分: workTypes.find((w) => w.id === record.workType)?.label,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "勤務記録");
    XLSX.writeFile(wb, `勤務記録_${format(currentDate, "yyyy年M月")}.xlsx`);
    
    showToast("エクセルファイルのエクスポートが完了しました", "success");
  };

  // 全データリセット
  const resetAllData = () => {
    showConfirm("全てのデータをリセットしますか？この操作は元に戻せません。", async () => {
      try {
        const success = await StorageService.resetAllData();
        if (success) {
          setAttendanceData([]);
          setScheduleData([]);
          showSuccess("全てのデータをリセットしました");
          
          // Firebase使用状況を更新
          const info = await StorageService.getFirebaseStorageInfo();
          if (info) {
            setFirebaseStorageInfo(info);
          }
        } else {
          showToast("データのリセットに失敗しました", "error");
        }
      } catch (error) {
        console.error("Error resetting data:", error);
        showToast("データのリセットに失敗しました", "error");
      }
    });
  };
  
  // 月次データをリセット
  const resetMonthData = () => {
    const targetMonth = format(currentDate, "yyyy-MM");
    
    showConfirm(`${format(currentDate, "yyyy年M月")}のデータのみをリセットしますか？この操作は元に戻せません。`, async () => {
      try {
        const success = await StorageService.deleteMonthData(targetMonth);
        
        if (success) {
          // Firebaseから最新データを再取得
          const newAttendanceData = await StorageService.getDataAsync<AttendanceRecord[]>(
            STORAGE_KEYS.ATTENDANCE_DATA, []
          );
          setAttendanceData(newAttendanceData);
          
          const newScheduleData = await StorageService.getDataAsync<ScheduleItem[]>(
            STORAGE_KEYS.SCHEDULE_DATA, []
          );
          setScheduleData(newScheduleData);
          
          // Firebase使用状況を更新
          const info = await StorageService.getFirebaseStorageInfo();
          if (info) {
            setFirebaseStorageInfo(info);
          }
          
          showSuccess(`${format(currentDate, "yyyy年M月")}のデータをリセットしました`);
        } else {
          showToast("データのリセットに失敗しました", "error");
        }
      } catch (error) {
        console.error("Error resetting month data:", error);
        showToast("データのリセットに失敗しました", "error");
      }
    });
  };
  
  // 予定の削除
  const deleteSchedule = (scheduleId: string) => {
    showConfirm("この予定を削除しますか？", () => {
      const newScheduleData = scheduleData.filter(item => item.id !== scheduleId);
      setScheduleData(newScheduleData);
      setShowScheduleModal(false);
      setSelectedScheduleItem(null);
      showToast("予定を削除しました", "info");
    });
  };

  //---------------------------------------------------------------
  // サブコンポーネント
  //---------------------------------------------------------------
  // オフライン表示コンポーネント
  const OfflineIndicator = () => {
    if (!isOffline) return null;
    
    return (
      <div className="offline-indicator">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
        オフラインモード{pendingChanges ? "（未同期のデータがあります）" : ""}
      </div>
    );
  };

  // TableViewコンポーネント
  const TableView = React.memo(() => {
    // スクロール位置を保持するための参照を追加
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [lastScrollPosition, setLastScrollPosition] = useState({ x: 0, y: 0 });

    const daysInMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    ).getDate();

    const dates = Array.from({ length: daysInMonth }, (_, i) => 
      new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)
    );

    // セル選択時のスクロール位置保持処理
    const handleCellClick = (e: React.MouseEvent, employeeId: number, date: Date) => {
      // 現在のスクロール位置を保存
      if (tableContainerRef.current) {
        setLastScrollPosition({
          x: tableContainerRef.current.scrollLeft,
          y: tableContainerRef.current.scrollTop
        });
      }

      // 通常の選択処理
      if (isBulkEditMode && isAdminMode) {
        toggleCellSelection(employeeId, date, e.ctrlKey || isCtrlPressed);
      } else {
        setSelectedCell({ employeeId, date });
        setShowWorkTypeModal(true);
      }

      // スクロール位置を復元
      requestAnimationFrame(() => {
        if (tableContainerRef.current) {
          tableContainerRef.current.scrollTo({
            left: lastScrollPosition.x,
            top: lastScrollPosition.y,
            behavior: 'instant'
          });
        }
      });
    };
    
    // 同じ従業員の週区切りでセルを選択
    const selectWeekCells = (employeeId: number, startDate: Date) => {
      if (!isBulkEditMode || !isAdminMode) return;
      
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
              onChange={(e) => setSelectedEmployee(e.target.value)}
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
                      onClick={() => setSelectedCells([])}
                      className="px-3 py-1 rounded bg-gray-200"
                      disabled={selectedCells.length === 0}
                    >
                      選択解除 {selectedCells.length > 0 && `(${selectedCells.length})`}
                    </button>
                    
                    <button
                      onClick={() => setIsMobileSelectMode(!isMobileSelectMode)}
                      className={`px-3 py-1 rounded ${
                        isMobileSelectMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                      } text-sm md:text-base`}
                    >
                      {isMobileSelectMode ? '複数選択モード：オン' : '複数選択モードに切り替え'}
                    </button>
                    
                    {selectedCells.length > 0 && (
                      <button
                        onClick={() => {
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
        >
          <div className="attendance-table-container">
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
                              if (selectedCount === dates.length) {
                                clearSelectionForEmployee(employee.id);
                              } else {
                                selectAllCellsForEmployee(employee.id);
                              }
                            }
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span>{employee.name}</span>
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
                } ${getCellBackgroundColor(date).text}`}
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
                
                {/* 勤務区分の集計 */}
                <div className="text-xs space-y-1 mt-1">
                  {Object.entries(dailySummary).map(([type, count]) => {
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
                    const employeeName = schedule.employeeId 
                      ? employees.find(e => e.id.toString() === schedule.employeeId)?.name 
                      : "全員";
                    
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
                        title={`${schedule.title}${schedule.details ? ` - ${schedule.details}` : ''} (${employeeName})`}
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
    if (!selectedEmployee) return null;
    
    const employeeId = parseInt(selectedEmployee);
    const employeeName = employees.find(emp => emp.id === employeeId)?.name || "従業員";
    
    return (
      <div className="p-4">
        <div className="mb-4 flex gap-2 items-center">
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
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
                    onClick={() => setSelectedCells([])}
                    className="px-3 py-1 rounded bg-gray-200"
                    disabled={selectedCells.length === 0}
                  >
                    選択解除 {selectedCells.length > 0 && `(${selectedCells.length})`}
                  </button>
                  
                  <button
                    onClick={() => setIsMobileSelectMode(!isMobileSelectMode)}
                    className={`px-3 py-1 rounded ${
                      isMobileSelectMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                    } text-sm md:text-base`}
                  >
                    {isMobileSelectMode ? '複数選択モード：オン' : '複数選択モードに切り替え'}
                  </button>
                  
                  {selectedCells.length > 0 && (
                    <button
                      onClick={() => {
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
                }`}
                onClick={(e) => {
                  if (isCurrentMonth) {
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
    }, [showWorkTypeModal, selectedCell, selectedCells, isBulkEditMode, attendanceData]);

    const handleSubmit = () => {
      // 一括編集モードの場合
      if (isBulkEditMode && isAdminMode && selectedCells.length > 0) {
        if (!selectedWorkType) return;
        
        const newAttendanceData = [...attendanceData];
        
        selectedCells.forEach(cell => {
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
            workType: selectedWorkType,
            employeeName: employees.find(emp => emp.id === cell.employeeId)?.name,
          };
          
          newAttendanceData.push(newRecord);
        });
        
        setAttendanceData(newAttendanceData);
        setShowWorkTypeModal(false);
        setSelectedCells([]);
        setSelectedWorkType("");
        
        showToast(`${selectedCells.length}件の勤務区分を一括更新しました`, "success");
        return;
      }
      
      // 通常の編集モード
      if (!selectedCell || !selectedWorkType) return;

      const dateStr = format(selectedCell.date, "yyyy-MM-dd");
      const newAttendanceData = attendanceData.filter(
        (record) =>
          !(
            record.employeeId === selectedCell.employeeId.toString() &&
            record.date === dateStr
          )
      );

      const newRecord: AttendanceRecord = {
        employeeId: selectedCell.employeeId.toString(),
        date: dateStr,
        workType: selectedWorkType,
        employeeName: employees.find(
          (emp) => emp.id === selectedCell.employeeId
        )?.name,
      };

      setAttendanceData([...newAttendanceData, newRecord]);
      setShowWorkTypeModal(false);
      setSelectedCell(null);
      setSelectedWorkType("");
      
      showToast(`${employees.find(emp => emp.id === selectedCell.employeeId)?.name}さんの勤務区分を登録しました`, "success");
    };

    const handleDelete = () => {
      if (isBulkEditMode && isAdminMode && selectedCells.length > 0) {
        showConfirm(`選択された${selectedCells.length}件の勤務区分を削除しますか？`, () => {
          const newAttendanceData = attendanceData.filter(record => {
            return !selectedCells.some(cell => 
              cell.employeeId.toString() === record.employeeId && 
              format(cell.date, "yyyy-MM-dd") === record.date
            );
          });
          
          setAttendanceData(newAttendanceData);
          setShowWorkTypeModal(false);
          setSelectedCells([]);
          
          showToast(`${selectedCells.length}件の勤務区分を削除しました`, "info");
        });
        return;
      }
      
      if (!selectedCell) return;
      
      const dateStr = format(selectedCell.date, "yyyy-MM-dd");
      const newAttendanceData = attendanceData.filter(
        record => !(record.employeeId === selectedCell.employeeId.toString() && record.date === dateStr)
      );
      
      setAttendanceData(newAttendanceData);
      setShowWorkTypeModal(false);
      setSelectedCell(null);
      
      showToast("勤務区分を削除しました", "info");
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
            Object.entries(calculateDailySummary(selectedDateDetails.date)).map(
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
                      {records.map((record) => (
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
                const employeeName = schedule.employeeId 
                  ? employees.find(e => e.id.toString() === schedule.employeeId)?.name 
                  : "全員";
                
                return (
                  <div key={schedule.id} className="mb-2 p-2 rounded" style={{ backgroundColor: `${schedule.color}20` }}>
                    <div className="font-medium flex justify-between">
                      <span>{schedule.title}</span>
                      <span className="text-sm text-gray-600">{employeeName}</span>
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
    const [empId, setEmpId] = useState(selectedEmployee || "");
    
    // 編集モードの場合は既存の値をセット
    useEffect(() => {
      if (selectedScheduleItem) {
        setTitle(selectedScheduleItem.title);
        setDetails(selectedScheduleItem.details || "");
        setColor(selectedScheduleItem.color || PRESET_COLORS[0].value);
        setEmpId(selectedScheduleItem.employeeId);
      } else {
        setTitle("");
        setDetails("");
        setColor(PRESET_COLORS[0].value);
        setEmpId(selectedEmployee || "");
      }
    }, [selectedScheduleItem, selectedEmployee]);

    const handleSubmit = () => {
      if (!title.trim() || !selectedScheduleDate) return;
      
      const dateStr = format(selectedScheduleDate, "yyyy-MM-dd");
      
      if (selectedScheduleItem) {
        // 既存の予定を更新
        const newScheduleData = scheduleData.map(item => 
          item.id === selectedScheduleItem.id 
            ? { ...item, title, details, color, employeeId: empId }
            : item
        );
        setScheduleData(newScheduleData);
        showToast("予定を更新しました", "success");
      } else {
        // 新規予定を追加
        const newScheduleItem: ScheduleItem = {
          id: Date.now().toString(),
          employeeId: empId,
          date: dateStr,
          title,
          details,
          color
        };
        setScheduleData([...scheduleData, newScheduleItem]);
        showToast("新しい予定を追加しました", "success");
      }
      
      closeScheduleModal();
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
            <label className="block text-sm font-medium text-gray-700 mb-1">従業員</label>
            <select
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="">全員共通</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id.toString()}>
                  {emp.name}
                </option>
              ))}
            </select>
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
              disabled={!title.trim()}
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

  // 管理者設定トグル
  const AdminToggle = () => {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white p-2 rounded-lg shadow-lg flex flex-col gap-2">
          <button
            onClick={() => setIsAdminMode(!isAdminMode)}
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
              onClick={showStorageUsage}
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
                    onClick={exportToExcel}
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
                        onClick={resetMonthData}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        {format(currentDate, "yyyy年M月")}のデータのみリセット
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
            
            {/* オフライン通知 */}
            <OfflineIndicator />
            
            {/* 同期ボタン - オフラインからオンラインに復帰したとき用 */}
            {!isOffline && pendingChanges && (
              <div className="fixed bottom-4 left-4 z-40">
                <button
                  onClick={syncChanges}
                  className="bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6"></path>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                    <path d="M3 22v-6h6"></path>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                  </svg>
                  データを同期
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AttendanceApp;