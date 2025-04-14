// src/types.ts
export interface AttendanceRecord {
  employeeId: string;
  date: string;
  workType: string;
  employeeName?: string;
}

export interface ScheduleItem {
  id: string;
  employeeId: string;  // 後方互換性のために維持
  employeeIds?: string[]; // 複数従業員対応
  date: string;
  title: string;
  details?: string | null; // nullも許容するように修正
  color?: string | null; // 同様にnullも許容
}

export interface CalendarDate {
  date: Date;
  isCurrentMonth: boolean;
}

export interface DailySummary {
  [workType: string]: number;
}

export interface AttendanceSummary {
  summary: { [key: string]: number };
  totalCount: number;
}