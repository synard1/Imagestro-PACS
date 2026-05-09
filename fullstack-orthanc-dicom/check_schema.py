import sqlite3
import os

# Connect to the SQLite database
db_path = 'simrs-order-ui/sim_orders.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all table names
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    print("Tables in the database:")
    for table in tables:
        print(f"- {table[0]}")
        
        # Get schema for each table
        cursor.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table[0]}';")
        schema = cursor.fetchone()
        if schema:
            print(f"  Schema: {schema[0]}")
        print()
    
    conn.close()
else:
    print(f"Database file {db_path} not found")