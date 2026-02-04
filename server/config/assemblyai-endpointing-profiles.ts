export type EndpointingProfile = {
  end_of_turn_confidence_threshold: number;
  min_end_of_turn_silence_when_confident: number;
  max_turn_silence: number;
};

export type BandName = 'K2' | 'ELEMENTARY' | 'MIDDLE' | 'HIGH' | 'COLLEGE';

export const ENDPOINTING_PROFILES: Record<BandName, EndpointingProfile> = {
  K2: {
    end_of_turn_confidence_threshold: 0.55,
    min_end_of_turn_silence_when_confident: 800,
    max_turn_silence: 6000,
  },
  ELEMENTARY: {
    end_of_turn_confidence_threshold: 0.60,
    min_end_of_turn_silence_when_confident: 600,
    max_turn_silence: 5000,
  },
  MIDDLE: {
    end_of_turn_confidence_threshold: 0.65,
    min_end_of_turn_silence_when_confident: 500,
    max_turn_silence: 4000,
  },
  HIGH: {
    end_of_turn_confidence_threshold: 0.70,
    min_end_of_turn_silence_when_confident: 400,
    max_turn_silence: 3500,
  },
  COLLEGE: {
    end_of_turn_confidence_threshold: 0.75,
    min_end_of_turn_silence_when_confident: 300,
    max_turn_silence: 3000,
  },
};

const TUTOR_PERSONA_TO_BAND: Record<string, BandName> = {
  'buddy the learning bear': 'K2',
  'buddy': 'K2',
  'ms. sunny': 'ELEMENTARY',
  'ms sunny': 'ELEMENTARY',
  'professor pepper': 'ELEMENTARY',
  'coach alex': 'MIDDLE',
  'dr. nova': 'MIDDLE',
  'dr nova': 'MIDDLE',
  'professor taylor': 'HIGH',
  'professor ace': 'HIGH',
  'dr. morgan': 'COLLEGE',
  'dr morgan': 'COLLEGE',
};

export function getBandFromTutorPersona(persona: string | undefined): BandName | null {
  if (!persona) return null;
  const normalized = persona.toLowerCase().trim();
  return TUTOR_PERSONA_TO_BAND[normalized] || null;
}

export function getBandFromGradeLevel(gradeLevel: string | number | undefined): BandName {
  if (gradeLevel === undefined || gradeLevel === null) return 'MIDDLE';
  
  const normalized = typeof gradeLevel === 'string' 
    ? gradeLevel.toLowerCase().trim() 
    : String(gradeLevel);
  
  if (normalized === 'k' || normalized === 'k-2' || normalized === 'kindergarten') return 'K2';
  if (normalized === '1' || normalized === '2') return 'K2';
  if (normalized === '3-5' || normalized === 'elementary') return 'ELEMENTARY';
  if (['3', '4', '5'].includes(normalized)) return 'ELEMENTARY';
  if (normalized === '6-8' || normalized === 'middle') return 'MIDDLE';
  if (['6', '7', '8'].includes(normalized)) return 'MIDDLE';
  if (normalized === '9-12' || normalized === 'high') return 'HIGH';
  if (['9', '10', '11', '12'].includes(normalized)) return 'HIGH';
  if (normalized === 'college' || normalized === 'adult' || normalized === 'university') return 'COLLEGE';
  
  const numericGrade = parseInt(normalized, 10);
  if (!isNaN(numericGrade)) {
    if (numericGrade <= 2) return 'K2';
    if (numericGrade <= 5) return 'ELEMENTARY';
    if (numericGrade <= 8) return 'MIDDLE';
    if (numericGrade <= 12) return 'HIGH';
    return 'COLLEGE';
  }
  
  return 'MIDDLE';
}

export function getEndpointingProfile(
  tutorPersona?: string,
  gradeLevel?: string | number
): { band: BandName; profile: EndpointingProfile } {
  const bandFromPersona = getBandFromTutorPersona(tutorPersona);
  const band = bandFromPersona || getBandFromGradeLevel(gradeLevel);
  return { band, profile: ENDPOINTING_PROFILES[band] };
}
