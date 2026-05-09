import { Database } from 'sqlite3';
import * as crypto from 'crypto';

export enum SyncEventType {
    ORDER_CREATED = 'ORDER_CREATED',
    ORDER_UPDATED = 'ORDER_UPDATED',
    ORDER_DELETED = 'ORDER_DELETED',
    ACCESSION_CREATED = 'ACCESSION_CREATED',
    ACCESSION_UPDATED = 'ACCESSION_UPDATED',
    ACCESSION_DELETED = 'ACCESSION_DELETED'
}

export enum SyncStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    RETRYING = 'RETRYING'
}

export interface SyncEvent {
    id: string;
    event_type: SyncEventType;
    source_service: string;
    target_service: string;
    entity_id: string;
    data: any;
    checksum: string;
    status: SyncStatus;
    retry_count: number;
    max_retries: number;
    created_at: string;
    updated_at: string;
    processed_at?: string;
    error_message?: string;
}

export type EventHandler = (event: SyncEvent) => Promise<boolean>;

export class DataSynchronizer {
    private db: Database;
    private eventHandlers: Map<SyncEventType, EventHandler[]> = new Map();
    private isProcessing: boolean = false;
    private processingInterval?: NodeJS.Timeout;

    constructor(dbPath: string = './sync/sync_events.db') {
        this.db = new Database(dbPath);
        this.initDatabase();
    }

    private initDatabase(): void {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS sync_events (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                source_service TEXT NOT NULL,
                target_service TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                data TEXT NOT NULL,
                checksum TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                retry_count INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME,
                error_message TEXT
            )
        `;

        const createIndexesSQL = [
            'CREATE INDEX IF NOT EXISTS idx_sync_events_status ON sync_events(status)',
            'CREATE INDEX IF NOT EXISTS idx_sync_events_event_type ON sync_events(event_type)',
            'CREATE INDEX IF NOT EXISTS idx_sync_events_entity_id ON sync_events(entity_id)',
            'CREATE INDEX IF NOT EXISTS idx_sync_events_created_at ON sync_events(created_at)'
        ];

        this.db.serialize(() => {
            this.db.run(createTableSQL);
            createIndexesSQL.forEach(sql => this.db.run(sql));
        });
    }

    private generateId(): string {
        return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private calculateChecksum(data: any): string {
        const dataString = JSON.stringify(data, Object.keys(data).sort());
        return crypto.createHash('sha256').update(dataString).digest('hex');
    }

    async storeEvent(event: Omit<SyncEvent, 'id' | 'checksum' | 'created_at' | 'updated_at'>): Promise<SyncEvent> {
        const id = this.generateId();
        const checksum = this.calculateChecksum(event.data);
        const timestamp = new Date().toISOString();

        const fullEvent: SyncEvent = {
            ...event,
            id,
            checksum,
            created_at: timestamp,
            updated_at: timestamp
        };

        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO sync_events (
                    id, event_type, source_service, target_service, entity_id,
                    data, checksum, status, retry_count, max_retries,
                    created_at, updated_at, error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(sql, [
                fullEvent.id,
                fullEvent.event_type,
                fullEvent.source_service,
                fullEvent.target_service,
                fullEvent.entity_id,
                JSON.stringify(fullEvent.data),
                fullEvent.checksum,
                fullEvent.status,
                fullEvent.retry_count,
                fullEvent.max_retries,
                fullEvent.created_at,
                fullEvent.updated_at,
                fullEvent.error_message
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(fullEvent);
                }
            });
        });
    }

    registerHandler(eventType: SyncEventType, handler: EventHandler): void {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType)!.push(handler);
    }

    async updateEventStatus(
        eventId: string, 
        status: SyncStatus, 
        errorMessage?: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE sync_events 
                SET status = ?, updated_at = ?, processed_at = ?, error_message = ?,
                    retry_count = CASE WHEN ? = 'FAILED' THEN retry_count + 1 ELSE retry_count END
                WHERE id = ?
            `;

            const processedAt = status === SyncStatus.COMPLETED ? new Date().toISOString() : null;

            this.db.run(sql, [
                status,
                new Date().toISOString(),
                processedAt,
                errorMessage,
                status,
                eventId
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async getPendingEvents(limit: number = 10): Promise<SyncEvent[]> {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM sync_events 
                WHERE status IN ('PENDING', 'FAILED') 
                AND retry_count < max_retries
                ORDER BY created_at ASC 
                LIMIT ?
            `;

            this.db.all(sql, [limit], (err, rows: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    const events = rows.map(row => ({
                        ...row,
                        data: JSON.parse(row.data)
                    }));
                    resolve(events);
                }
            });
        });
    }

    async processEvents(): Promise<void> {
        if (this.isProcessing) return;

        this.isProcessing = true;
        try {
            const events = await this.getPendingEvents();
            
            for (const event of events) {
                await this.processEvent(event);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private async processEvent(event: SyncEvent): Promise<void> {
        try {
            await this.updateEventStatus(event.id, SyncStatus.PROCESSING);

            const handlers = this.eventHandlers.get(event.event_type) || [];
            let success = true;

            for (const handler of handlers) {
                try {
                    const result = await handler(event);
                    if (!result) {
                        success = false;
                        break;
                    }
                } catch (error) {
                    success = false;
                    console.error(`Handler failed for event ${event.id}:`, error);
                    await this.updateEventStatus(
                        event.id, 
                        SyncStatus.FAILED, 
                        error instanceof Error ? error.message : 'Unknown error'
                    );
                    break;
                }
            }

            if (success) {
                await this.updateEventStatus(event.id, SyncStatus.COMPLETED);
            }

        } catch (error) {
            console.error(`Failed to process event ${event.id}:`, error);
            await this.updateEventStatus(
                event.id, 
                SyncStatus.FAILED, 
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }

    startProcessing(intervalMs: number = 5000): void {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
        }

        this.processingInterval = setInterval(() => {
            this.processEvents().catch(console.error);
        }, intervalMs);

        console.log(`Data synchronizer started with ${intervalMs}ms interval`);
    }

    stopProcessing(): void {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = undefined;
        }
        console.log('Data synchronizer stopped');
    }

    async getStatistics(): Promise<any> {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    status,
                    event_type,
                    COUNT(*) as count,
                    AVG(retry_count) as avg_retries
                FROM sync_events 
                WHERE created_at >= datetime('now', '-24 hours')
                GROUP BY status, event_type
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

    async cleanup(olderThanDays: number = 7): Promise<number> {
        return new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM sync_events 
                WHERE status = 'COMPLETED' 
                AND processed_at < datetime('now', '-' || ? || ' days')
            `;
            
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
        this.stopProcessing();
        this.db.close();
    }
}

// Convenience functions
export function createOrderSyncEvent(data: any): Omit<SyncEvent, 'id' | 'checksum' | 'created_at' | 'updated_at'> {
    return {
        event_type: SyncEventType.ORDER_CREATED,
        source_service: 'order-management',
        target_service: 'accession-api',
        entity_id: data.order_id || data.id,
        data,
        status: SyncStatus.PENDING,
        retry_count: 0,
        max_retries: 3
    };
}

export function createAccessionSyncEvent(data: any): Omit<SyncEvent, 'id' | 'checksum' | 'created_at' | 'updated_at'> {
    return {
        event_type: SyncEventType.ACCESSION_CREATED,
        source_service: 'accession-api',
        target_service: 'order-management',
        entity_id: data.accession_no || data.id,
        data,
        status: SyncStatus.PENDING,
        retry_count: 0,
        max_retries: 3
    };
}