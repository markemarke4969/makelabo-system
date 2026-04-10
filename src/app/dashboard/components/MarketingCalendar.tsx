"use client";

import { useState } from "react";

const PROJECT_COLORS: Record<string, string> = {
  "ハピネス": "#4f8ff7",
  "WBC": "#34d399",
  "競馬": "#fbbf24",
  "レインボー": "#a78bfa",
};

interface Schedule {
  date: string;
  item: string;
  project: string;
  color: string;
}

interface Props {
  year: number;
  month: number;
  schedules: Schedule[];
  projectNames: string[];
}

export default function MarketingCalendar({ year, month, schedules, projectNames }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(projectNames.map((n) => [n, true]))
  );

  const toggle = (name: string) => {
    setChecked((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const filtered = schedules.filter((sc) => checked[sc.project]);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
      <h3 className="text-sm font-medium text-[#9aa0b8] mb-4">{year}年{month}月 配信カレンダー</h3>

      {/* 案件チェックボックス */}
      <div className="flex gap-4 mb-4 flex-wrap">
        {projectNames.map((name) => {
          const color = PROJECT_COLORS[name] ?? "#9aa0b8";
          return (
            <label key={name} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked[name] ?? false}
                onChange={() => toggle(name)}
                className="w-4 h-4 rounded border-2 accent-current"
                style={{ accentColor: color }}
              />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-xs font-medium" style={{ color }}>{name}</span>
            </label>
          );
        })}
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-xs text-[#6b7194] py-1 font-medium">{wd}</div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e-${i}`} className="min-h-[64px] bg-[#13162a] rounded" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateStr = `${year}-${pad(month)}-${pad(day)}`;
          const daySchedules = filtered.filter((sc) => sc.date === dateStr);
          const isToday = (() => {
            const now = new Date();
            return now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day;
          })();

          return (
            <div key={day}
              className={`min-h-[64px] bg-[#13162a] rounded p-1 border ${isToday ? "border-[#4f8ff7]/60" : "border-[#2a2f45]/30"}`}
            >
              <p className={`text-[10px] mb-0.5 ${isToday ? "text-[#4f8ff7] font-bold" : "text-[#6b7194]"}`}>{day}</p>
              {daySchedules.slice(0, 3).map((sc, j) => (
                <div key={j}
                  className="rounded px-1 py-0.5 mb-0.5 text-[9px] text-white truncate"
                  style={{ background: sc.color + "33", borderLeft: `2px solid ${sc.color}` }}
                  title={`${sc.project}: ${sc.item}`}
                >
                  {sc.item}
                </div>
              ))}
              {daySchedules.length > 3 && (
                <p className="text-[8px] text-[#6b7194]">+{daySchedules.length - 3}件</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
