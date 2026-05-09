#!/usr/bin/env python3
"""
Script untuk memperbaiki schema database secara langsung
Khusus untuk kolom satusehat_service_request_id yang masih VARCHAR(20)
"""

import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def fix_schema_direct():
    """Memperbaiki schema database secara langsung"""
    
    # Konfigurasi database - coba beberapa kemungkinan
    configs = [
        {
            "host": "localhost",
            "port": 5532,
            "dbname": "worklist_db",
            "user": "dicom",
            "password": "dicom123"
        },
        {
            "host": "localhost", 
            "port": 5432,
            "dbname": "worklist_db",
            "user": "dicom",
            "password": "dicom123"
        },
        {
            "host": "postgres",
            "port": 5432,
            "dbname": "worklist_db", 
            "user": "dicom",
            "password": "dicom123"
        }
    ]
    
    for i, config in enumerate(configs):
        print(f"🔄 Mencoba koneksi {i+1}: {config['host']}:{config['port']}")
        
        try:
            conn = psycopg2.connect(**config)
            cur = conn.cursor()
            
            print("✅ Koneksi berhasil!")
            
            # Cek schema saat ini
            print("\n📋 Mengecek schema kolom satusehat_service_request_id...")
            cur.execute("""
                SELECT column_name, data_type, character_maximum_length 
                FROM information_schema.columns 
                WHERE table_name = 'sim_orders' 
                AND column_name = 'satusehat_service_request_id'
            """)
            
            result = cur.fetchone()
            if result:
                col_name, data_type, max_length = result
                print(f"📊 Kolom saat ini: {col_name} - {data_type}({max_length})")
                
                if max_length and max_length < 100:
                    print(f"⚠️  Kolom terlalu kecil ({max_length}), perlu diperbesar ke 100")
                    
                    # Perbaiki schema
                    print("🔧 Memperbaiki schema...")
                    cur.execute("""
                        ALTER TABLE sim_orders 
                        ALTER COLUMN satusehat_service_request_id 
                        TYPE VARCHAR(100)
                    """)
                    
                    conn.commit()
                    print("✅ Schema berhasil diperbaiki!")
                    
                    # Verifikasi
                    cur.execute("""
                        SELECT column_name, data_type, character_maximum_length 
                        FROM information_schema.columns 
                        WHERE table_name = 'sim_orders' 
                        AND column_name = 'satusehat_service_request_id'
                    """)
                    
                    result = cur.fetchone()
                    if result:
                        col_name, data_type, max_length = result
                        print(f"✅ Verifikasi: {col_name} - {data_type}({max_length})")
                else:
                    print(f"✅ Kolom sudah benar: {data_type}({max_length})")
            else:
                print("❌ Kolom satusehat_service_request_id tidak ditemukan!")
            
            cur.close()
            conn.close()
            return True
            
        except psycopg2.OperationalError as e:
            print(f"❌ Koneksi gagal: {e}")
            continue
        except Exception as e:
            print(f"❌ Error: {e}")
            continue
    
    print("❌ Semua koneksi gagal!")
    return False

if __name__ == "__main__":
    print("🚀 Memulai perbaikan schema database...")
    success = fix_schema_direct()
    
    if success:
        print("\n🎉 Perbaikan schema selesai!")
        print("💡 Silakan restart aplikasi simrs-order-ui dan test ulang")
    else:
        print("\n❌ Perbaikan schema gagal!")
        print("💡 Pastikan Docker container PostgreSQL sudah berjalan")