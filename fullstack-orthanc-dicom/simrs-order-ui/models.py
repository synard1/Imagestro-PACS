from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator
from datetime import date, datetime
import re

AllowedSex = Literal["male", "female", "other", "unknown"]
AllowedModality = Literal[
    "CR", "CT", "MR", "US", "XA", "MG", "NM", "PT", "DX", "SC", "OT"
]

NIK_RE = re.compile(r"^\d{16}$")
IHS_RE = re.compile(r"^[A-Za-z0-9\-_.]{3,64}$")
MRN_RE = re.compile(r"^[A-Za-z0-9\-_/]{2,32}$")
REG_RE = re.compile(r"^[A-Za-z0-9\-_/]{3,32}$")
CODE_RE = re.compile(r"^[A-Za-z0-9\-_.]{2,32}$")


def dicomify_name(name: str) -> str:
    parts = [p for p in re.split(r"\s+", name.strip()) if p]
    if not parts:
        return name
    last = parts[-1]
    first = " ".join(parts[:-1]) if len(parts) > 1 else ""
    return f"{last.upper()}^{first.upper()}" if first else last.upper()


class PatientInfo(BaseModel):
    national_id: str = Field(..., description="NIK 16 digit")
    ihs_number: Optional[str] = Field(None, description="Optional IHS number")
    medical_record_number: str = Field(..., description="MRN")
    name: str = Field(..., description="Patient full name")
    sex: AllowedSex = Field(..., description="Sex")
    birth_date: date = Field(..., description="Birth date")

    @field_validator("national_id")
    @classmethod
    def validate_nik(cls, v: str) -> str:
        if not NIK_RE.match(v):
            raise ValueError("NIK harus 16 digit numerik")
        return v

    @field_validator("ihs_number")
    @classmethod
    def validate_ihs(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if not IHS_RE.match(v):
            raise ValueError("IHS tidak valid")
        return v

    @field_validator("medical_record_number")
    @classmethod
    def validate_mrn(cls, v: str) -> str:
        if not MRN_RE.match(v):
            raise ValueError("MRN hanya huruf/angka dan -_/ dengan panjang 2-32")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v.strip()) < 2:
            raise ValueError("Nama pasien minimal 2 karakter")
        return v

    @field_validator("birth_date")
    @classmethod
    def validate_birthdate(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Tanggal lahir tidak boleh di masa depan")
        return v


class OrderInfo(BaseModel):
    modality: AllowedModality
    procedure_code: str = Field(..., description="Procedure/LOINC code")
    procedure_name: str = Field(..., description="Procedure description")
    scheduled_at: datetime = Field(..., description="Scheduled datetime ISO8601")
    registration_number: Optional[str] = Field(None, description="Optional No. Reg")
    clinical_notes: Optional[str] = Field(None, max_length=2048)

    @field_validator("procedure_code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not CODE_RE.match(v):
            raise ValueError("Kode prosedur tidak valid")
        return v

    @field_validator("registration_number")
    @classmethod
    def validate_reg(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if not REG_RE.match(v):
            raise ValueError("No. registrasi tidak valid")
        return v


class SatusehatInfo(BaseModel):
    satusehat_patient_id: Optional[str] = Field(None, description="SATUSEHAT Patient ID")
    satusehat_encounter_id: Optional[str] = Field(None, description="SATUSEHAT Encounter ID")


class OrderCreatePayload(BaseModel):
    patient: PatientInfo
    order: OrderInfo

    def to_gateway_payload(self) -> dict:
        return {
            "patient_national_id": self.patient.national_id,
            "ihs_number": self.patient.ihs_number,
            "mrn": self.patient.medical_record_number,
            "patient_name": dicomify_name(self.patient.name),
            "sex": self.patient.sex,
            "birth_date": self.patient.birth_date.isoformat(),
            "modality": self.order.modality,
            "procedure_code": self.order.procedure_code,
            "procedure_name": self.order.procedure_name,
            "scheduled_at": self.order.scheduled_at.isoformat(),
            "registration_number": self.order.registration_number,
            "clinical_notes": self.order.clinical_notes,
        }


class CompleteFlowPayload(BaseModel):
    patient: PatientInfo
    order: OrderInfo
    satusehat: SatusehatInfo
    loinc_code: Optional[str] = Field(None, description="LOINC code if different from procedure_code")

    def to_gateway_payload(self) -> dict:
        return {
            **OrderCreatePayload(patient=self.patient, order=self.order).to_gateway_payload(),
            "satusehat_patient_id": self.satusehat.satusehat_patient_id,
            "satusehat_encounter_id": self.satusehat.satusehat_encounter_id,
            "loinc_code": self.loinc_code or self.order.procedure_code,
        }


class SimOrderRecord(BaseModel):
    patient_national_id: Optional[str] = None
    ihs_number: Optional[str] = None
    mrn: Optional[str] = None
    patient_name: Optional[str] = None
    sex: Optional[str] = None
    birth_date: Optional[date] = None
    modality: Optional[str] = None
    procedure_code: Optional[str] = None
    procedure_name: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    registration_number: Optional[str] = None
    clinical_notes: Optional[str] = None
    service_type: Optional[str] = None
    served_status: Optional[str] = None
    dicom_status: Optional[str] = None
    satusehat_status: Optional[str] = None
    satusehat_imaging_study_id: Optional[str] = None
    # Practitioner/location fields for SATUSEHAT integration
    practitioner_nik: Optional[str] = None
    practitioner_name: Optional[str] = None
    satusehat_practitioner_id: Optional[str] = None
    satusehat_location_id: Optional[str] = None
    # New status/ID fields for monitoring
    encounter_status: Optional[str] = None
    service_request_status: Optional[str] = None
    satusehat_encounter_id: Optional[str] = None
    satusehat_service_request_id: Optional[str] = None

class SimOrderUpdate(BaseModel):
    patient_national_id: Optional[str] = None
    ihs_number: Optional[str] = None
    mrn: Optional[str] = None
    patient_name: Optional[str] = None
    sex: Optional[str] = None
    birth_date: Optional[date] = None
    modality: Optional[str] = None
    procedure_code: Optional[str] = None
    procedure_name: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    registration_number: Optional[str] = None
    clinical_notes: Optional[str] = None
    service_type: Optional[str] = None
    served_status: Optional[str] = None
    dicom_status: Optional[str] = None
    satusehat_status: Optional[str] = None
    satusehat_imaging_study_id: Optional[str] = None
    # Practitioner/location fields for SATUSEHAT integration
    practitioner_nik: Optional[str] = None
    practitioner_name: Optional[str] = None
    satusehat_practitioner_id: Optional[str] = None
    satusehat_location_id: Optional[str] = None
    # New status/ID fields for monitoring
    encounter_status: Optional[str] = None
    service_request_status: Optional[str] = None
    satusehat_encounter_id: Optional[str] = None
    satusehat_service_request_id: Optional[str] = None


class ServiceRequestPayload(BaseModel):
    patient_id: str = Field(..., alias="patientId", description="SatuSehat Patient ID")
    encounter_id: str = Field(..., alias="encounterId", description="SatuSehat Encounter ID")
    practitioner_id: str = Field(..., alias="practitionerId", description="SatuSehat Practitioner ID")
    location_id: str = Field(..., alias="locationId", description="SatuSehat Location ID")
    code: str = Field(..., description="Procedure/Service code")
    code_display: str = Field(..., alias="codeDisplay", description="Procedure/Service display name")
    category_code: Optional[str] = Field("394914008", alias="categoryCode", description="Category code (default: Radiology)")
    category_display: Optional[str] = Field("Radiology", alias="categoryDisplay", description="Category display")
    priority: Optional[str] = Field("routine", description="Priority (routine, urgent, asap, stat)")
    intent: Optional[str] = Field("order", description="Intent (proposal, plan, order)")
    status: Optional[str] = Field("active", description="Status (draft, active, on-hold, revoked, completed)")
    authored_on: Optional[datetime] = Field(None, alias="authoredOn", description="Authored date")
    reason_code: Optional[str] = Field(None, alias="reasonCode", description="Reason code")
    reason_display: Optional[str] = Field(None, alias="reasonDisplay", description="Reason display")
    note: Optional[str] = Field(None, description="Additional notes")
    
    model_config = {"populate_by_name": True}

    @field_validator("authored_on")
    @classmethod
    def validate_authored_on(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is None:
            return datetime.now()
        return v