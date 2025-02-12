export interface Employee {
    id: number;
    name: string;
  }
  
  export interface WorkType {
    id: string;
    label: string;
  }
  
  export interface AttendanceRecord {
    employeeId: string;
    date: string;
    workType: string;
    employeeName: string | undefined;
  }
  
  export interface CalendarDate {
    date: Date;
    isCurrentMonth: boolean;
  }
  
  export interface AttendanceSummary {
    summary: { [key: string]: number };
    totalCount: number;
  }