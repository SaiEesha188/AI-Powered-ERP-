// CSV and Excel output for reports (RPT-02).
import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';

export type ExportFormat = 'json' | 'csv' | 'xlsx';

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

/** Spreadsheet apps execute cells starting with these characters as formulas (CSV injection). */
function safeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [columns.map((c) => esc(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => esc(safeCell(c.value(row)))).join(','));
  // BOM so Excel opens UTF-8 (Hindi names, ₹) correctly.
  return `﻿${lines.join('\r\n')}`;
}

export async function toXlsx<T>(sheet: string, columns: Column<T>[], rows: T[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheet.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, width: Math.max(12, c.header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    ws.addRow(columns.map((c) => {
      const v = c.value(row);
      return typeof v === 'number' || typeof v === 'boolean' ? v : safeCell(v);
    }));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Returns rows as JSON, or a CSV/XLSX download. Use with @Res({ passthrough: true }). */
export async function exportTable<T>(res: Response, format: ExportFormat, name: string, columns: Column<T>[], rows: T[]) {
  if (format === 'json') return rows;
  const filename = `${name}.${format}`;
  res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  if (format === 'csv') {
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    return new StreamableFile(Buffer.from(toCsv(columns, rows), 'utf8'));
  }
  res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return new StreamableFile(await toXlsx(name, columns, rows));
}
