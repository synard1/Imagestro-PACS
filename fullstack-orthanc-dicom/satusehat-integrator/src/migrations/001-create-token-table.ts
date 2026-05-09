import { getPool, initTokenStorageTable } from "../db";

async function runMigration() {
  console.log("Running migration 001: Create token storage table");
  
  try {
    const pool = await getPool();
    if (!pool) {
      console.error("Failed to connect to database");
      process.exit(1);
    }
    
    await initTokenStorageTable();
    console.log("Migration 001 completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Migration 001 failed:", error);
    process.exit(1);
  }
}

runMigration();