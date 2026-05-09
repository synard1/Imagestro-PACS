# Imagestro Simulation Architecture

## Overview

The **Imagestro Simulation** is a high-fidelity demonstration environment designed to showcase the integration of clinical imaging workflows with regulatory compliance systems. It provides a visual, interactive representation of how imaging orders flow through the system, from initial scheduling to final regulatory reporting. The simulation specifically highlights the synchronization between clinical operations (DICOM/PACS) and regulatory requirements (SATUSEHAT), serving as a powerful tool for both development testing and stakeholder demonstration.

## Phase 1 (Clinical Workflow)

The clinical phase handles the lifecycle of an imaging order from creation to completion, supporting different input modalities:

*   **Branching Logic:** The workflow supports two primary branches based on the integration level:
    *   **Bridged Sync:** Automated synchronization with hospital information systems (HIS/SIMRS) via HL7/API integrations, seamlessly updating order status as patients arrive, are examined, and images are acquired.
    *   **Manual Upload:** A fallback or standalone workflow where orders are manually updated and DICOM studies are manually uploaded, useful for external clinics or non-integrated systems.
*   **Status Progression:** Both branches converge at the `ORDER_COMPLETED` state, indicating that clinical activities (examination and reporting) are finished and the study is ready for regulatory processing.

## Phase 2 (Regulatory Workflow)

Once the clinical phase is completed (`ORDER_COMPLETED`), the regulatory phase begins, ensuring all data meets national health data standards:

*   **Manual Trigger:** The transition to the regulatory phase requires a manual trigger or confirmation, allowing clinicians or administrators to verify the final report before submission.
*   **SATUSEHAT Compliance Gates:** The simulation models the strict data requirements of the SATUSEHAT platform:
    *   **Encounter Validation:** Ensuring the imaging study is linked to a valid, active patient encounter.
    *   **Diagnostic Report (SR) Generation:** Converting the clinical findings into a structured, standard-compliant format (e.g., FHIR DiagnosticReport).
    *   **Accession Matching:** Verifying that the DICOM Accession Number correctly maps to the corresponding order and encounter IDs in the national registry.

## State Management

A critical architectural decision was the implementation of a **Single Source of Truth** for state management. 

*   **Fixing Vanishing Nodes:** Previous iterations suffered from "vanishing nodes" due to fragmented state updates between the UI representation and the underlying data model. By centralizing the state, any update to an order's status reliably and predictably updates the corresponding simulation node's state, preventing UI inconsistencies and ensuring the simulation accurately reflects the backend reality.

## Data Pipeline

The data pipeline is designed for robustness and ease of use during demonstrations:

*   **Select2 Integration:** High-performance dropdowns are used for selecting patients and procedures, capable of handling large datasets smoothly.
*   **Auto-filling Credentials:** To streamline the demonstration process, critical identifiers like NIK (National Identification Number) and IHS (Indonesia Health Services) numbers are auto-filled based on patient selection, preventing manual data entry errors.
*   **"404 Immune" Fallback Logic:** The `api.js` service layer includes robust error handling. If a requested resource or endpoint is unavailable (HTTP 404), the system automatically falls back to local mock data. This ensures the simulation remains functional even if backend services are temporarily disconnected or in a transitional state.

## UI Mechanics

The user interface of the simulation is optimized for clarity and presentation:

*   **Static Nodes:** The workflow is presented using a static node graph. This provides a consistent, readable map of the process.
*   **Non-draggable Configuration:** To prevent accidental disruption of the presentation flow, nodes are fixed in place (non-draggable).
*   **Vertical Clearance:** A generous 150px vertical clearance is enforced between nodes. This spacing accommodates expanding context menus, status details, and action buttons without overlapping adjacent elements, ensuring a clean and professional appearance.

## Deployment

The simulation environment is currently deployed and accessible:

*   **Host:** `103.42.117.19:8082`
*   **Container Name:** `mwl-pacs-ui-v2-nginx`
