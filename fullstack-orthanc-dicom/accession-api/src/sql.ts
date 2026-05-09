import { Pool } from "pg";

export const pool = new Pool({
  host: process.env.PGHOST || "postgres",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "orthanc",
  password: process.env.PGPASSWORD || "orthanc_secure_password",
  database: process.env.PGDATABASE || "orthanc",
});

export async function initDb() {
  const sql = `
  -- Enable UUID extension
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  create table if not exists facilities (
    id serial primary key,
    code text unique not null,
    name text,
    issuer text not null default 'https://sys-ids.kemkes.go.id/acsn'
  );

  create table if not exists accession_counters (
    date date not null,
    modality text not null,
    facility_code text not null,
    seq int not null,
    primary key (date, modality, facility_code)
  );

  -- Unified accessions table aligned with SIMRS payload
  create table if not exists accessions (
    id UUID primary key default uuid_generate_v4(),
    facility_code text not null,
    accession_number text not null unique,
    issuer text not null,
    modality text not null,
    procedure_code text,
    procedure_name text,
    scheduled_at timestamptz,
    patient_national_id text not null,
    patient_name text not null,
    gender text,
    birth_date date,
    medical_record_number text,
    ihs_number text,
    registration_number text,
    status text not null default 'issued',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- Align existing tables to unified schema when pre-existing from legacy versions
  alter table facilities add column if not exists issuer text;

  alter table accessions add column if not exists modality text;
  alter table accessions add column if not exists procedure_code text;
  alter table accessions add column if not exists procedure_name text;
  alter table accessions add column if not exists scheduled_at timestamptz;
  alter table accessions add column if not exists patient_national_id text;
  alter table accessions add column if not exists patient_name text;
  alter table accessions add column if not exists gender text;
  alter table accessions add column if not exists birth_date date;
  alter table accessions add column if not exists medical_record_number text;
  alter table accessions add column if not exists ihs_number text;
  alter table accessions add column if not exists registration_number text;
  alter table accessions add column if not exists status text;
  alter table accessions add column if not exists created_at timestamptz default now();
  alter table accessions add column if not exists updated_at timestamptz default now();

  -- Indexes for common lookups
  create index if not exists idx_accessions_patient_national_id on accessions(patient_national_id);
  create index if not exists idx_accessions_registration_number on accessions(registration_number);
  create index if not exists idx_accessions_modality on accessions(modality);
  `;
  await pool.query(sql);

  // seed facility default jika belum ada
  const code = process.env.DEFAULT_FACILITY_CODE || "RSABC";
  const name = process.env.DEFAULT_FACILITY_NAME || "Default Facility";
  const issuer = process.env.ISSUER_BASE_URL || "https://sys-ids.kemkes.go.id/acsn";
  await pool.query(
    `insert into facilities(code,name,issuer)
     values ($1,$2,$3)
     on conflict (code) do update set name=excluded.name, issuer=excluded.issuer`,
    [code, name, issuer]
  );
}

export async function nextSeq(facility_code: string, modality: string, date: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    
    // Gunakan advisory lock untuk mencegah race condition
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`${facility_code}_${modality}_${date}`]);
    
    const up = await client.query(
      `insert into accession_counters(date, modality, facility_code, seq)
       values ($1,$2,$3,1)
       on conflict (date,modality,facility_code)
       do update set seq = accession_counters.seq + 1
       returning seq`,
      [date, modality, facility_code]
    );
    await client.query("commit");
    return Number(up.rows[0].seq);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

// Generate and insert accession aligned with unified schema
export async function generateAndInsertAccession(
  facility_code: string,
  modality: string,
  date: string,
  yymmdd: string,
  sequencePadding: number,
  issuerBase: string,
  payload: {
    procedure_code?: string;
    procedure_name?: string;
    scheduled_at?: string;
    patient_national_id: string;
    patient_name: string;
    gender?: string;
    birth_date?: string; // ISO date string
    medical_record_number?: string;
    ihs_number?: string;
    registration_number?: string;
  }
): Promise<{ id: string, accession_number: string, issuer: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Prevent race conditions with advisory lock
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`${facility_code}_${modality}_${date}`]);

    // Generate sequence number
    const seqResult = await client.query(
      `insert into accession_counters(date, modality, facility_code, seq)
       values ($1,$2,$3,1)
       on conflict (date,modality,facility_code)
       do update set seq = accession_counters.seq + 1
       returning seq`,
      [date, modality, facility_code]
    );

    const seq = Number(seqResult.rows[0].seq);
    const accession_number = `${modality}.${yymmdd}.${String(seq).padStart(sequencePadding, "0")}`;
    const issuer = `${issuerBase}/${payload.patient_national_id}|${accession_number}`;

    // Insert accession record
    const insertResult = await client.query(
      `insert into accessions(
        facility_code, accession_number, issuer, modality, procedure_code, procedure_name, scheduled_at,
        patient_national_id, patient_name, gender, birth_date, medical_record_number, ihs_number, registration_number, status
      ) values (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,'issued'
      ) returning id`,
      [
        facility_code, accession_number, issuer, modality, payload.procedure_code, payload.procedure_name, payload.scheduled_at,
        payload.patient_national_id, payload.patient_name, payload.gender, payload.birth_date, payload.medical_record_number, payload.ihs_number, payload.registration_number
      ]
    );

    const accessionId = insertResult.rows[0].id;

    await client.query("commit");
    return { id: accessionId, accession_number, issuer };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
