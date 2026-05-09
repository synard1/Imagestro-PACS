import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite3';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    CRITICAL = 'CRITICAL'
}

export enum LogCategory {
    API = 'API',
    DATABASE = 'DATABASE',
    VALIDATION = 'VALIDATION',
    SYNC = 'SYNC',
    BUSINESS = 'BUSINESS',
    SECURITY = 'SECURITY',
    PERFORMANCE = 'PERFORMANCE'
}

export interface LogEntry {
    id?: string;
    timestamp: string;
    level: LogLevel;
    category: LogCategory;
    operation: string;
    message: string;
    user_id?: string;
    request_id?: string;
    data?: any;
    error_details?: any;
    execution_time_ms?: number;
}

export interface LogContext {
    user_id?: string;
    request_id?: string;
    session_id?: string;
}

export class UnifiedLogger {
    private db: Database;
    private context: LogContext = {};
    private logDir: string;
    private maxFileSize: number;
    private maxFiles: number;

    constructor(
        dbPath: string = './logs/unified_logs.db',
        logDir: string = './logs',
        maxFileSize: number = 10 * 1024 * 1024, // 10MB
        maxFiles: number = 5
    ) {
        this.logDir = logDir;
        this.maxFileSize = maxFileSize;
        this.maxFiles = maxFiles;

        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        // Initialize database
        this.db = new Database(dbPath);
        this.initDatabase();
    }

    private initDatabase(): void {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS logs (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                category TEXT NOT NULL,
                operation TEXT NOT NULL,
                message TEXT NOT NULL,
                user_id TEXT,
                request_id TEXT,
                data TEXT,
                error_details TEXT,
                execution_time_ms REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createIndexesSQL = [
            'CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)',
            'CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category)',
            'CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_logs_request_id ON logs(request_id)'
        ];

        this.db.serialize(() => {
            this.db.run(createTableSQL);
            createIndexesSQL.forEach(sql => this.db.run(sql));
        });
    }

    setContext(context: LogContext): void {
        this.context = { ...this.context, ...context };
    }

    clearContext(): void {
        this.context = {};
    }

    private generateId(): string {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private log(level: LogLevel, category: LogCategory, operation: string, message: string, options: {
        data?: any;
        error_details?: any;
        execution_time_ms?: number;
    } = {}): void {
        const entry: LogEntry = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            level,
            category,
            operation,
            message,
            user_id: this.context.user_id,
            request_id: this.context.request_id,
            data: options.data ? JSON.stringify(options.data) : undefined,
            error_details: options.error_details ? JSON.stringify(options.error_details) : undefined,
            execution_time_ms: options.execution_time_ms
        };

        // Store in database
        this.storeInDatabase(entry);

        // Write to file
        this.writeToFile(entry);

        // Console output for development
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[${entry.timestamp}] ${level} ${category}:${operation} - ${message}`);
        }
    }

    private storeInDatabase(entry: LogEntry): void {
        const sql = `
            INSERT INTO logs (
                id, timestamp, level, category, operation, message,
                user_id, request_id, data, error_details, execution_time_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        this.db.run(sql, [
            entry.id,
            entry.timestamp,
            entry.level,
            entry.category,
            entry.operation,
            entry.message,
            entry.user_id,
            entry.request_id,
            entry.data,
            entry.error_details,
            entry.execution_time_ms
        ]);
    }

    private writeToFile(entry: LogEntry): void {
        const logFile = path.join(this.logDir, `unified_${new Date().toISOString().split('T')[0]}.log`);
        const logLine = `${entry.timestamp} [${entry.level}] ${entry.category}:${entry.operation} - ${entry.message}\n`;

        fs.appendFileSync(logFile, logLine);
        this.rotateLogFiles();
    }

    private rotateLogFiles(): void {
        const files = fs.readdirSync(this.logDir)
            .filter(f => f.startsWith('unified_') && f.endsWith('.log'))
            .map(f => ({
                name: f,
                path: path.join(this.logDir, f),
                stats: fs.statSync(path.join(this.logDir, f))
            }))
            .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

        // Remove old files if exceeding max count
        if (files.length > this.maxFiles) {
            files.slice(this.maxFiles).forEach(file => {
                fs.unlinkSync(file.path);
            });
        }
    }

    debug(category: LogCategory, operation: string, message: string, options: any = {}): void {
        this.log(LogLevel.DEBUG, category, operation, message, options);
    }

    info(category: LogCategory, operation: string, message: string, options: any = {}): void {
        this.log(LogLevel.INFO, category, operation, message, options);
    }

    warning(category: LogCategory, operation: string, message: string, options: any = {}): void {
        this.log(LogLevel.WARNING, category, operation, message, options);
    }

    error(category: LogCategory, operation: string, message: string, options: any = {}): void {
        this.log(LogLevel.ERROR, category, operation, message, options);
    }

    critical(category: LogCategory, operation: string, message: string, options: any = {}): void {
        this.log(LogLevel.CRITICAL, category, operation, message, options);
    }

    // Specialized logging methods
    logValidationError(operation: string, errors: any[], data: any): void {
        this.error(LogCategory.VALIDATION, operation, 'Validation failed', {
            error_details: { validation_errors: errors },
            data
        });
    }

    logDatabaseOperation(operation: string, table: string, rowsAffected: number, executionTime: number): void {
        this.info(LogCategory.DATABASE, operation, `${operation} on ${table}`, {
            data: { table, rows_affected: rowsAffected },
            execution_time_ms: executionTime
        });
    }

    logSyncEvent(operation: string, entityType: string, entityId: string, success: boolean): void {
        this.info(LogCategory.SYNC, operation, `Sync ${operation} for ${entityType}`, {
            data: { entity_type: entityType, entity_id: entityId, success }
        });
    }

    // Operation timer utility
    operationTimer(category: LogCategory, operation: string) {
        const startTime = Date.now();
        return {
            end: (message: string = 'Operation completed', data?: any) => {
                const executionTime = Date.now() - startTime;
                this.info(category, operation, message, {
                    data,
                    execution_time_ms: executionTime
                });
            }
        };
    }

    // Query methods
    async getLogs(filters: {
        level?: LogLevel;
        category?: LogCategory;
        operation?: string;
        user_id?: string;
        request_id?: string;
        start_date?: string;
        end_date?: string;
        limit?: number;
    } = {}): Promise<LogEntry[]> {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM logs WHERE 1=1';
            const params: any[] = [];

            if (filters.level) {
                sql += ' AND level = ?';
                params.push(filters.level);
            }
            if (filters.category) {
                sql += ' AND category = ?';
                params.push(filters.category);
            }
            if (filters.operation) {
                sql += ' AND operation = ?';
                params.push(filters.operation);
            }
            if (filters.user_id) {
                sql += ' AND user_id = ?';
                params.push(filters.user_id);
            }
            if (filters.request_id) {
                sql += ' AND request_id = ?';
                params.push(filters.request_id);
            }
            if (filters.start_date) {
                sql += ' AND timestamp >= ?';
                params.push(filters.start_date);
            }
            if (filters.end_date) {
                sql += ' AND timestamp <= ?';
                params.push(filters.end_date);
            }

            sql += ' ORDER BY timestamp DESC';

            if (filters.limit) {
                sql += ' LIMIT ?';
                params.push(filters.limit);
            }

            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows as LogEntry[]);
                }
            });
        });
    }

    async getStatistics(): Promise<any> {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    level,
                    category,
                    COUNT(*) as count,
                    AVG(execution_time_ms) as avg_execution_time
                FROM logs 
                WHERE timestamp >= datetime('now', '-24 hours')
                GROUP BY level, category
                ORDER BY count DESC
            `;

            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async cleanup(olderThanDays: number = 30): Promise<number> {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM logs WHERE timestamp < datetime("now", "-" || ? || " days")';
            
            this.db.run(sql, [olderThanDays], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    close(): void {
        this.db.close();
    }
}