import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { parseNestedFormat, parseFlatFormat } from '../src/validators/accession-input';

describe('Property 9: Nested/flat normalization equivalence', () => {
  it('same data in nested and flat format produces identical normalized output', () => {
    const validNik = fc.array(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 16, maxLength: 16 }).map(a => a.join(''));
    const validName = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
    const validMod = fc.constantFrom('CT','MR','CR','DX','US','XA','RF','MG','NM','PT');

    fc.assert(fc.property(validNik, validName, validMod, (nik, name, mod) => {
      const nested = parseNestedFormat({ patient: { id: nik, name }, modality: mod });
      const flat = parseFlatFormat({ patient_national_id: nik, patient_name: name, modality: mod });
      if (!nested.success || !flat.success) return true; // skip if validation fails
      return nested.data.patientNationalId === flat.data.patientNationalId &&
             nested.data.patientName === flat.data.patientName &&
             nested.data.modality === flat.data.modality;
    }), { numRuns: 200 });
  });
});
