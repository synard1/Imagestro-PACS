/**
 * Duplicate Detection Utility
 * Prevents patient record duplication using fuzzy matching algorithms
 *
 * Medical context: Patient safety critical - false negatives dangerous, false positives acceptable
 */

/**
 * Calculate Jaro-Winkler similarity between two strings
 * Better for short strings (names) than Levenshtein
 * Returns 0-1 (1 = identical)
 */
export function jaroWinklerSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // If either string is empty after trimming
  if (!s1.length || !s2.length) return 0;

  // Jaro distance
  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;

      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;

    while (!s2Matches[k]) k++;

    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const m = matches;
  const t = transpositions / 2;

  const jaro = (m / s1.length + m / s2.length + (m - t) / m) / 3;

  // Jaro-Winkler boost for common prefixes
  const prefix = Math.min(4, s1.length, s2.length);
  let commonPrefix = 0;

  for (let i = 0; i < prefix; i++) {
    if (s1[i] === s2[i]) commonPrefix++;
    else break;
  }

  const winklerBoost = 0.1 * commonPrefix * (1 - jaro);
  return jaro + winklerBoost;
}

/**
 * Normalize name for comparison
 * - Remove titles (Mr., Mrs., Dr.)
 * - Remove extra spaces
 * - Convert to uppercase for consistent comparison
 */
export function normalizeName(name) {
  if (!name) return '';
  return name
    .replace(/^(mr\.|mrs\.|ms\.|dr\.|prof\.)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Check if birth dates are approximately equal
 * Allow 1 day difference due to timezone/entry variance
 */
export function isBirthDateApproximatelyEqual(date1, date2) {
  if (!date1 || !date2) return false;

  const d1 = new Date(date1);
  const d2 = new Date(date2);

  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;

  const diffHours = Math.abs(d1 - d2) / (1000 * 60 * 60);
  return diffHours <= 24; // Within 1 day
}

/**
 * Calculate NIK similarity
 * NIK is 16 digits - exact match required normally
 * But allow for typos: compare last 8 digits (more stable) + overall length
 */
export function nikSimilarity(nik1, nik2) {
  if (!nik1 || !nik2) return 0;

  const clean1 = nik1.replace(/\D/g, '');
  const clean2 = nik2.replace(/\D/g, '');

  if (clean1.length === 0 || clean2.length === 0) return 0;

  // Exact match
  if (clean1 === clean2) return 1;

  // Length mismatch likely means different person
  if (clean1.length !== clean2.length) return 0;

  // Count matching digits
  let matches = 0;
  const minLen = Math.min(clean1.length, clean2.length);

  for (let i = 0; i < minLen; i++) {
    if (clean1[i] === clean2[i]) matches++;
  }

  const similarity = matches / Math.max(clean1.length, clean2.length);

  // If at least 12/16 digits match, might be typo
  return similarity;
}

/**
 * Check if two patients are potential duplicates
 * Returns match score (0-1) and reason
 */
export function checkPatientDuplicate(newPatient, existingPatients, thresholds = {
  name: 0.85,      // Jaro-Winkler similarity threshold for name
  birthDate: true, // Must match approximately
  nik: 0.90,       // NIK similarity threshold (90% digits match)
  ihs: 1.0,        // IHS must be exact match if present
}) {
  const matches = [];

  for (const existing of existingPatients) {
    let score = 0;
    let reasons = [];

    // 1. Name similarity (weight: 0.4)
    const nameSim = jaroWinklerSimilarity(
      normalizeName(newPatient.name),
      normalizeName(existing.name)
    );

    if (nameSim >= thresholds.name) {
      score += 0.4;
      reasons.push(`Name similarity: ${(nameSim * 100).toFixed(0)}%`);
    }

    // 2. Birth date (weight: 0.3)
    const birthDateMatch = isBirthDateApproximatelyEqual(
      newPatient.birth_date,
      existing.birth_date
    );

    if (birthDateMatch) {
      score += 0.3;
      reasons.push('Birth date matches');
    }

    // 3. NIK/National ID (weight: 0.2 - strong identifier)
    const newNik = newPatient.patient_id || newPatient.national_id || '';
    const existingNik = existing.patient_id || existing.national_id || '';

    if (newNik && existingNik) {
      const nikSim = nikSimilarity(newNik, existingNik);
      if (nikSim >= thresholds.nik) {
        score += 0.2;
        reasons.push(`NIK similarity: ${(nikSim * 100).toFixed(0)}%`);
      }
    }

    // 4. IHS Number (weight: 0.1 - exact match if present)
    const newIhs = newPatient.ihs_number || newPatient.satusehat_ihs_number || '';
    const existingIhs = existing.ihs_number || existing.satusehat_ihs_number || '';

    if (newIhs && existingIhs && newIhs === existingIhs) {
      score += 0.1;
      reasons.push('IHS Number matches exactly');
    }

    // If score >= 0.7 (70%), consider it high-probability duplicate
    if (score >= 0.7) {
      matches.push({
        patient: existing,
        score,
        reasons,
        matchLevel: score >= 0.9 ? 'high' : score >= 0.8 ? 'medium' : 'low'
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Format duplicate warning message for user display
 */
export function formatDuplicateWarning(duplicates) {
  if (duplicates.length === 0) {
    return { showWarning: false, message: '', matches: [] };
  }

  const topMatch = duplicates[0];
  const patient = topMatch.patient;

  let message = `Potential duplicate detected:\n\n`;
  message += `Existing Patient:\n`;
  message += `  Name: ${patient.name}\n`;
  message += `  MRN: ${patient.mrn || 'N/A'}\n`;
  message += `  NIK: ${patient.patient_id || 'N/A'}\n`;
  message += `  Birth Date: ${patient.birth_date || 'N/A'}\n`;
  message += `  IHS: ${patient.ihs_number || patient.satusehat_ihs_number || 'N/A'}\n\n`;
  message += `Match Confidence: ${(topMatch.score * 100).toFixed(0)}%\n`;
  message += `Reasons: ${topMatch.reasons.join(', ')}\n\n`;

  if (duplicates.length > 1) {
    message += `Plus ${duplicates.length - 1} other potential match(es).\n`;
  }

  return {
    showWarning: true,
    message,
    matches: duplicates,
    topMatch
  };
}

/**
 * Batch check for duplicates against all existing patients
 * Optimized: filters before expensive fuzzy matching
 */
export async function findPotentialDuplicates(newPatient, limit = 5) {
  try {
    // Import patient service dynamically to avoid circular deps
    const patientService = await import('../services/patientService');
    const allPatients = await patientService.listPatients({ limit: 1000 }); // Reasonable limit

    // Quick pre-filter: birth date must match (within 1 day)
    const byBirthDate = allPatients.filter(p =>
      isBirthDateApproximatelyEqual(newPatient.birth_date, p.birth_date)
    );

    if (byBirthDate.length === 0) {
      return []; // No possible matches if birth dates don't align
    }

    // Run fuzzy matching on birth date matches
    const duplicates = checkPatientDuplicate(newPatient, byBirthDate);

    return duplicates.slice(0, limit);
  } catch (error) {
    console.error('Duplicate detection failed:', error);
    return [];
  }
}

/**
 * Quick check: is this likely a duplicate? (lightweight version)
 * Used for real-time feedback during form entry
 */
export function quickDuplicateCheck(formData, existingPatients) {
  if (!formData.name || !formData.birth_date) {
    return { showWarning: false };
  }

  // Very fast pre-filters first
  const birthDateCandidates = existingPatients.filter(p =>
    isBirthDateApproximatelyEqual(formData.birth_date, p.birth_date)
  );

  if (birthDateCandidates.length === 0) {
    return { showWarning: false };
  }

  // Do quick name check with lower threshold for suggestions
  const quickThreshold = 0.75; // Lower threshold for suggestions

  for (const candidate of birthDateCandidates) {
    const nameSim = jaroWinklerSimilarity(
      normalizeName(formData.name),
      normalizeName(candidate.name)
    );

    if (nameSim >= quickThreshold) {
      return {
        showWarning: true,
        level: 'suggestion',
        message: `Patient with similar name and birth date exists: ${candidate.name} (MRN: ${candidate.mrn})`,
        candidate
      };
    }
  }

  return { showWarning: false };
}
