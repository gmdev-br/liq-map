import { format } from 'date-fns';

export interface ExportData {
    metadata: {
        exportDate: string;
        symbol?: string;
        months?: number;
        recordCount?: number;
        format: 'csv' | 'json';
    };
    data: any[];
}

export function exportToCSV(data: any[], filename: string = 'data.csv'): void {
    if (!data || data.length === 0) {
        console.warn('No data to export');
        return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row =>
            headers.map(header => {
                const value = row[header];
                if (value === null || value === undefined) return '';
                if (typeof value === 'string' && value.includes(',')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return String(value);
            }).join(',')
        )
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
}

export function exportToJSON(data: any[], metadata?: Record<string, any>, filename: string = 'data.json'): void {
    if (!data || data.length === 0) {
        console.warn('No data to export');
        return;
    }

    const exportData: ExportData = {
        metadata: {
            exportDate: new Date().toISOString(),
            ...metadata,
            format: 'json'
        },
        data
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    downloadBlob(blob, filename);
}

export function importFromCSV(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                const lines = text.split('\n').filter(line => line.trim());

                if (lines.length < 2) {
                    reject(new Error('CSV file is empty or invalid'));
                    return;
                }

                const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
                const data = lines.slice(1).map(line => {
                    const values = parseCSVLine(line);
                    const row: any = {};
                    headers.forEach((header, index) => {
                        const value = values[index];
                        if (value === '') {
                            row[header] = null;
                        } else if (!isNaN(Number(value))) {
                            row[header] = Number(value);
                        } else {
                            row[header] = value;
                        }
                    });
                    return row;
                });

                resolve(data);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

export function importFromJSON(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                const parsed = JSON.parse(text);
                resolve(parsed);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

/**
 * OPTIMIZED CSV line parser using state machine approach
 * More efficient than character-by-character with repeated string concatenation
 * Uses array buffering for better performance on large CSV files
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    const chars = line.split('');  // Pre-split for faster access
    const len = chars.length;
    let current: string[] = [];  // Use array buffer instead of string concatenation
    let inQuotes = false;
    let i = 0;

    while (i < len) {
        const char = chars[i];

        if (char === '"') {
            if (inQuotes && i + 1 < len && chars[i + 1] === '"') {
                // Escaped quote
                current.push('"');
                i += 2;
                continue;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field - join buffer and trim
            result.push(current.join('').trim());
            current = [];
        } else {
            current.push(char);
        }
        i++;
    }

    // Add final field
    result.push(current.join('').trim());
    return result;
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function formatTimestampForExport(timestamp: number): string {
    return format(new Date(timestamp * 1000), 'dd/MM/yyyy HH:mm:ss');
}

export function generateExportFilename(symbol: string, fileFormat: 'csv' | 'json'): string {
    const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
    return `liquidation_${symbol}_${timestamp}.${fileFormat}`;
}
