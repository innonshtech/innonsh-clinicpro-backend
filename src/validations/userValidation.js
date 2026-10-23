export const INTAKE_CATEGORIES = [
  'Oral fluids',
  'IV fluids',
  'Enteral / tube feeding',
  'Other measurable intake'
];

export const OUTPUT_CATEGORIES = [
  'Urine',
  'Vomit / emesis',
  'Drain output',
  'Other measurable output'
];

export function normalizeIoCategory(direction, category) {
  if (!category || typeof category !== 'string') return null;
  const cat = category.trim().toLowerCase();
  const dir = (direction || '').trim().toLowerCase();

  if (dir === 'intake') {
    if (cat === 'oral fluids' || cat === 'oral' || cat === 'oral fluid') return 'Oral fluids';
    if (cat === 'iv fluids' || cat === 'iv' || cat === 'iv fluid' || cat === 'intravenous') return 'IV fluids';
    if (cat.includes('enteral') || cat.includes('tube feeding') || cat.includes('tube')) return 'Enteral / tube feeding';
    if (cat.includes('other') || cat === 'other measurable intake') return 'Other measurable intake';
  } else if (dir === 'output') {
    if (cat === 'urine') return 'Urine';
    if (cat.includes('vomit') || cat.includes('emesis')) return 'Vomit / emesis';
    if (cat.includes('drain')) return 'Drain output';
    if (cat.includes('other') || cat === 'other measurable output') return 'Other measurable output';
  }
  return null;
}

export const intakeOutputSchema = z.object({
  clinicId: z.string().optional().nullable(),
  direction: z.enum(['intake', 'output', 'INTAKE', 'OUTPUT']),
  category: z.string().min(1, 'Category is required'),
  amount: z.union([z.number(), z.string()]).refine(val => {
    if (val === null || val === undefined || val === '') return false;
    const num = Number(val);
    return !isNaN(num) && num > 0 && isFinite(num);
  }, {
    message: 'Amount must be a positive measurable number in mL'
  }),
  amount_ml: z.union([z.number(), z.string()]).optional().nullable(),
  unit: z.string().optional().default('mL'),
  recorded_at: z.string().optional().nullable().refine(val => {
    if (!val) return true;
    return !isNaN(Date.parse(val));
  }, {
    message: 'Invalid recorded_at timestamp format'
  }),
  recordedAt: z.string().optional().nullable().refine(val => {
    if (!val) return true;
    return !isNaN(Date.parse(val));
  }, {
    message: 'Invalid recordedAt timestamp format'
  }),
  remarks: z.string().max(1000).optional().nullable(),
  notes: z.string().max(1000).optional().nullable()
}).superRefine((data, ctx) => {
  const normCat = normalizeIoCategory(data.direction, data.category);
  if (!normCat) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid category "${data.category}" for direction "${data.direction}".`,
      path: ['category']
    });
  }
});

export const intakeOutputUpdateSchema = z.object({
  action: z.enum(['void', 'correct', 'amend']).optional(),
  isVoided: z.boolean().optional(),
  voidReason: z.string().optional().nullable(),
  void_reason: z.string().optional().nullable(),
  correctionReason: z.string().optional().nullable(),
  correction_reason: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  amount: z.union([z.number(), z.string()]).optional().nullable().refine(val => {
    if (val === undefined || val === null || val === '') return true;
    const num = Number(val);
    return !isNaN(num) && num > 0 && isFinite(num);
  }, {
    message: 'Corrected amount must be a positive measurable number in mL'
  }),
  category: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
}).superRefine((data, ctx) => {
  const isVoid = data.isVoided === true || data.action === 'void';
  if (isVoid) {
    const reason = (data.voidReason || data.void_reason || data.reason || '').trim();
    if (!reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A reason for voiding this entry is required',
        path: ['voidReason']
      });
    }
  }
  const isCorrect = data.action === 'correct' || data.action === 'amend';
  if (isCorrect) {
    const reason = (data.correctionReason || data.correction_reason || data.reason || '').trim();
    if (!reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A reason for correcting this entry is required',
        path: ['correctionReason']
      });
    }
  }
});

export const nurseVitalsSchema = z.object({
  clinicId: z.string().optional().nullable(),
  bp_systolic: z.coerce.number().min(30).max(300).optional().nullable(),
  bp_diastolic: z.coerce.number().min(20).max(200).optional().nullable(),
  bp: z.string().optional().nullable(),
  pulse: z.coerce.number().min(10).max(350).optional().nullable(),
  temperature: z.coerce.number().min(20).max(120).optional().nullable(),
  temperature_unit: z.enum(['C', 'F', 'c', 'f']).optional().default('C'),
  respiratory_rate: z.coerce.number().min(2).max(100).optional().nullable(),
  spo2: z.coerce.number().min(0).max(100).optional().nullable(),
  blood_glucose: z.coerce.number().min(10).max(1000).optional().nullable(),
  glucose_context: z.string().optional().nullable(),
  pain_score: z.coerce.number().min(0).max(10).optional().nullable(),
  weight: z.coerce.number().min(0.5).max(500).optional().nullable(),
  recorded_at: z.string().optional().nullable(),
  recordedAt: z.string().optional().nullable()
}).superRefine((data, ctx) => {
  const hasAtLeastOne =
    (data.bp_systolic !== undefined && data.bp_systolic !== null) ||
    (data.bp_diastolic !== undefined && data.bp_diastolic !== null) ||
    (data.pulse !== undefined && data.pulse !== null) ||
    (data.temperature !== undefined && data.temperature !== null) ||
    (data.respiratory_rate !== undefined && data.respiratory_rate !== null) ||
    (data.spo2 !== undefined && data.spo2 !== null) ||
    (data.blood_glucose !== undefined && data.blood_glucose !== null) ||
    (data.pain_score !== undefined && data.pain_score !== null) ||
    (data.weight !== undefined && data.weight !== null);

  if (!hasAtLeastOne) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one valid vital measurement must be provided',
      path: ['measurements']
    });
  }
});

import { z } from 'zod';

export const phoneRegex = /^[0-9]{10}$/;

export const phoneSchema = z.string()
  .min(1, 'Phone number is required')
  .regex(phoneRegex, 'Phone number must be exactly 10 numeric digits');

export const optionalPhoneSchema = z.string()
  .optional()
  .nullable()
  .or(z.literal(''))
  .refine(val => !val || phoneRegex.test(val), {
    message: 'Phone number must be exactly 10 numeric digits'
  });

export const emailRegex = /^(?!.*\.\.)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;

export const emailSchema = z.string()
  .min(1, 'Email address is required')
  .regex(emailRegex, 'Please enter a valid email address');

export const optionalEmailSchema = z.string()
  .optional()
  .nullable()
  .or(z.literal(''))
  .refine(val => !val || (typeof val === 'string' && val.trim() !== '' && emailRegex.test(val.trim())), {
    message: 'Please enter a valid email address'
  });

export const gmailRegex = /^(?!.*\.\.)[a-zA-Z0-9._%+-]+@gmail\.com$/i;

export const doctorEmailSchema = z.string()
  .min(1, 'Email address is required')
  .regex(gmailRegex, 'Please enter a valid Gmail address');

export const optionalDoctorEmailSchema = z.string()
  .optional()
  .nullable()
  .or(z.literal(''))
  .refine(val => !val || gmailRegex.test(val), {
    message: 'Please enter a valid Gmail address'
  });

export const loginSchema = z.object({
  email: optionalEmailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const patientRegistrationSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: optionalEmailSchema,
  phoneNumber: phoneSchema,
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.string().min(1, 'Gender is required'),
  bloodGroup: z.string().optional().nullable().or(z.literal('')),
  emergencyContact: optionalPhoneSchema,
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: z.string().optional().nullable().or(z.literal('')),
  city: z.string().optional().nullable().or(z.literal('')),
  state: z.string().optional().nullable().or(z.literal('')),
  zipCode: z.string().optional().nullable().or(z.literal('')),
  clinicId: z.string().optional().nullable().or(z.literal('')),
  medicalHistory: z.string().optional().nullable().or(z.literal('')),
  allergies: z.string().optional().nullable().or(z.literal('')),
  currentMedications: z.string().optional().nullable().or(z.literal('')),
  symptoms: z.string().optional().nullable().or(z.literal('')),
});

export const patientListQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val, 10) || 1),
  limit: z.string().optional().transform(val => parseInt(val, 10) || 10),
  name: z.string().optional(),
  phoneNumber: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).passthrough();

export const patientSearchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.string().optional().transform(val => parseInt(val, 10) || 10),
}).passthrough();

export const doctorRegistrationSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  profileImage: z.string().optional().nullable().or(z.literal('')),
  dateOfBirth: z.string().optional().nullable().or(z.literal('')),
  gender: z.string().optional().nullable().or(z.literal('')),
  email: doctorEmailSchema,
  password: z.string().optional().nullable().or(z.literal('')),
  phone: optionalPhoneSchema,
  specialty: z.string().optional().nullable().or(z.literal('')),
  experience: z.number().optional().nullable().or(z.string().optional()).transform(val => Number(val) || 0),
  hospital: z.string().optional().nullable().or(z.literal('')),
  bio: z.string().optional().nullable().or(z.literal('')),
  
  // Optional / Allowable fields
  supSpeciality: z.string().optional().nullable().or(z.literal('')),
  subSpecialty: z.string().optional().nullable().or(z.literal('')),
  consultantFee: z.number().optional().nullable().or(z.string().optional().nullable()).transform(val => (val !== null && val !== undefined && val !== '') ? (Number(val) || 0) : undefined),
  consultationFee: z.number().optional().nullable().or(z.string().optional().nullable()).transform(val => (val !== null && val !== undefined && val !== '') ? (Number(val) || 0) : undefined),
  qualifications: z.union([
    z.array(z.string()),
    z.string().transform(val => val.split(',').map(s => s.trim()).filter(Boolean))
  ]).optional().nullable(),
  qualification: z.string().optional().nullable().or(z.literal('')),
  licenseNumber: z.string().optional().nullable().or(z.literal('')),
  sessionTime: z.string().optional().nullable().or(z.literal('')),
  hospitalAddress: z.string().optional().nullable().or(z.literal('')),
  hospitalPhone: optionalPhoneSchema,
  hospitalCity: z.string().optional().nullable().or(z.literal('')),
  homeAddress: z.string().optional().nullable().or(z.literal('')),
  home_address: z.string().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable().or(z.literal('')),
  location: z.string().optional().nullable().or(z.literal('')),
  department: z.string().optional().nullable().or(z.literal('')),
  hospitalNumber: optionalPhoneSchema,
  emergencyContact: z.string().optional().nullable().or(z.literal('')),
  emergencyContactName: z.string().optional().nullable().or(z.literal('')),
  emergencyPhone: optionalPhoneSchema,
  emergencyRelationship: z.string().optional().nullable().or(z.literal('')),
  clinicId: z.string().optional().nullable().or(z.literal('')),
  degreeCertificate: z.string().optional().nullable().or(z.literal('')),
  identityProof: z.string().optional().nullable().or(z.literal('')),
  status: z.string().optional(),
  isVerified: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  startTime: z.string().optional().nullable().or(z.literal('')),
  endTime: z.string().optional().nullable().or(z.literal('')),
  availableDays: z.union([
    z.array(z.string()),
    z.string().transform(val => val.split(',').map(s => s.trim()).filter(Boolean))
  ]).optional().nullable(),
  availableTime: z.string().optional().nullable().or(z.literal('')),
  available: z.object({
    days: z.union([
      z.array(z.string()),
      z.string().transform(val => val.split(',').map(s => s.trim()).filter(Boolean))
    ]).optional().nullable(),
    time: z.string().optional().nullable().or(z.literal(''))
  }).optional().nullable()
});

export const clinicRegistrationSchema = z.object({
  clinicName: z.string().optional().nullable().or(z.literal('')),
  clinicType: z.string().optional().nullable().or(z.literal('')),
  registrationNumber: z.string().optional().nullable().or(z.literal('')),
  taxId: z.string().optional().nullable().or(z.literal('')),
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  phone: optionalPhoneSchema,
  
  description: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  logo: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  is24x7: z.boolean().optional(),
  is_24x7: z.boolean().optional(),
  images: z.array(z.string()).optional().nullable(),
  licenseDocument: z.any().optional().nullable(),
  licenseDocumentUrl: z.string().optional().nullable(),
  gstDocument: z.any().optional().nullable(),
  gstDocumentUrl: z.string().optional().nullable(),
  modules: z.object({
    lab: z.boolean().optional().default(false),
    ipd: z.boolean().optional().default(false)
  }).optional().default({ lab: false, ipd: false }),
  openingHours: z.record(z.string(), z.object({
    open: z.string().optional(),
    close: z.string().optional(),
  })).optional()
});

export const appointmentCreateSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  doctorId: z.string().min(1, 'Doctor ID is required'),
  appointmentDate: z.string().min(1, 'Appointment date is required'),
  timeSlot: z.string().min(1, 'Time slot is required'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
  
  // Optional metadata if passed for UI convenience
  doctorName: z.string().optional(),
  patientName: z.string().optional(),
  isEmergency: z.boolean().optional(),
});

export const appointmentListQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val, 10) || 1),
  limit: z.string().optional().transform(val => parseInt(val, 10) || 10),
  doctorId: z.string().optional(),
  date: z.string().optional(),
  status: z.enum(['booked', 'checked_in', 'in_progress', 'completed', 'cancelled', 'scheduled', 'no_show']).optional(),
}).passthrough(); // Allow extra params like _t (cache buster) without failing validation

export const appointmentStatusSchema = z.object({
  status: z.enum(['booked', 'checked_in', 'in_progress', 'completed', 'cancelled', 'scheduled', 'no_show'], {
    errorMap: () => ({ message: "Invalid status value" })
  }),
});

export const appointmentCancelSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
});

export const appointmentRescheduleSchema = z.object({
  appointmentDate: z.string().min(1, 'Appointment date is required'),
  timeSlot: z.string().min(1, 'Time slot is required'),
  notes: z.string().optional(),
});

export const doctorAvailabilitySchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required'),
  date: z.string().min(1, 'Date is required'),
  availableSlots: z.array(z.string()).min(1, 'At least one slot is required'),
});

// For update, we make all patient fields optional
export const patientUpdateSchema = patientRegistrationSchema.partial();

export const doctorUpdateSchema = doctorRegistrationSchema.partial().extend({
  password: z.string().min(8, 'Password must be at least 8 characters long').optional()
});

export const visitCreateSchema = z.object({
  appointment_id: z.string().min(1, 'Appointment ID is required'),
  doctor_id: z.string().min(1, 'Doctor ID is required'),
  patient_id: z.string().min(1, 'Patient ID is required'),
  clinicId: z.string().optional(),
});

export const prescriptionCreateSchema = z.object({
  visit_id: z.string().min(1, 'Visit ID is required'),
  medicines: z.array(z.object({
    name: z.string().min(1, 'Medicine name is required'),
    dosage: z.string().min(1, 'Dosage is required'),
    duration: z.string().min(1, 'Duration is required'),
    instructions: z.string().optional()
  })).min(1, 'At least one medicine is required')
});

export const visitUpdateSchema = z.object({
  symptoms: z.string().optional(),
  diagnosis: z.string().optional(),
  medicines: z.array(z.object({
    name: z.string().min(1, 'Medicine name is required'),
    dosage: z.string().min(1, 'Dosage is required'),
    duration: z.string().min(1, 'Duration is required'),
    instructions: z.string().optional()
  })).optional(),
  clinicalNotes: z.string().optional(),
  followUpDate: z.string().optional().nullable(),
  followUpNotes: z.string().optional().nullable(),
  followUpRequired: z.boolean().optional(),
});

export const visitNotesSchema = z.object({
  visit_id: z.string().min(1, 'Visit ID is required'),
  symptoms: z.string().optional(),
  diagnosis: z.string().optional(),
  follow_up_date: z.string().optional().nullable(),
  follow_up_notes: z.string().optional().nullable(),
});

export const billingCreateSchema = z.object({
  visit_id: z.string().min(1, 'Visit ID is required'),
  items: z.array(z.object({
    type: z.enum(['consultation', 'lab', 'medicine', 'other']),
    name: z.string().min(1, 'Item name is required'),
    amount: z.number().min(0, 'Amount must be positive'),
  })).min(1, 'At least one item is required'),
  discount: z.number().optional().default(0),
  tax: z.number().optional().default(0),
});

export const billingPaymentSchema = z.object({
  paymentAmount: z.number().min(0, 'Payment amount must be positive'),
  paymentMethod: z.enum(['cash', 'card', 'upi', 'online', 'other']),
  transactionId: z.string().optional(),
});

export const billingRefundSchema = z.object({
  refundAmount: z.number().min(0, 'Refund amount must be positive'),
  reason: z.string().min(1, 'Refund reason is required'),
});

export const billingListQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val, 10) || 1),
  limit: z.string().optional().transform(val => parseInt(val, 10) || 10),
  status: z.enum(['pending', 'partially_paid', 'paid', 'cancelled', 'refunded']).optional(),
  patientId: z.string().optional(),
  doctorId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).passthrough();

export const followupListQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val, 10) || 1),
  limit: z.string().optional().transform(val => parseInt(val, 10) || 10),
  date: z.string().optional(),
  doctorId: z.string().optional(),
}).passthrough(); // Allow extra query params without failing validation




export const labRegistrationSchema = z.object({
  labName: z.string().min(1, 'Lab name is required'),
  labType: z.string().optional().default('diagnostic'),
  description: z.string().optional().nullable().or(z.literal('')),
  logo: z.string().optional().nullable().or(z.literal('')),
  phone: phoneSchema,
  email: emailSchema,
  loginEmail: emailSchema,
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  website: z.string().optional().nullable().or(z.literal('')),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().optional().default('India'),
  registrationNumber: z.string().optional().nullable().or(z.literal('')),
  taxId: z.string().optional().nullable().or(z.literal('')),
  licenseDocumentUrl: z.string().optional().nullable().or(z.literal('')),
  nablAccredited: z.boolean().optional().default(false),
  homeCollectionAvailable: z.boolean().optional().default(false),
  operatingHours: z.record(z.any()).optional().default({}),
  role: z.string().optional().default('lab'),
  status: z.string().optional().default('active'),
});

export const COMMON_WEAK_PASSWORDS = new Set([
  '12345678',
  'password',
  'password1',
  'qwerty123',
  'admin123',
  '123456789',
  'letmein123',
  'welcome123'
]);

export function validateNursePassword(password) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, code: 'WEAK_PASSWORD', message: 'Password is required' };
  }
  if (password.length < 8) {
    return { isValid: false, code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, code: 'WEAK_PASSWORD', message: 'Password must contain at least 1 uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, code: 'WEAK_PASSWORD', message: 'Password must contain at least 1 lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, code: 'WEAK_PASSWORD', message: 'Password must contain at least 1 number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return { isValid: false, code: 'WEAK_PASSWORD', message: 'Password must contain at least 1 special character' };
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return { isValid: false, code: 'WEAK_PASSWORD', message: 'Password is too common or easily guessable' };
  }
  return { isValid: true };
}

export const nursePasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least 1 uppercase letter' })
  .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least 1 lowercase letter' })
  .refine(val => /[0-9]/.test(val), { message: 'Password must contain at least 1 number' })
  .refine(val => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(val), { message: 'Password must contain at least 1 special character' })
  .refine(val => !COMMON_WEAK_PASSWORDS.has(val.toLowerCase()), { message: 'Password is too common or easily guessable' });

export const nurseEmailRegex = /^(?!.*\.\.)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;

export function validateNurseEmail(email) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Email address is required' };
  }
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Email cannot be empty' };
  }
  if (/\s/.test(trimmed)) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Email cannot contain spaces' };
  }
  if (/\.\./.test(trimmed)) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Email cannot contain consecutive dots' };
  }
  const atParts = trimmed.split('@');
  if (atParts.length !== 2) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Email must contain exactly one @ symbol' };
  }
  const [localPart, domainPart] = atParts;
  if (!localPart || !domainPart) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Invalid email username or domain' };
  }
  if (!domainPart.includes('.') || domainPart.startsWith('.') || domainPart.endsWith('.')) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Domain must contain a valid extension' };
  }
  const domainSegments = domainPart.split('.');
  const tld = domainSegments[domainSegments.length - 1].toLowerCase();
  if (!/^[a-zA-Z]{2,}$/.test(tld)) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Invalid domain extension' };
  }
  const domainLower = domainPart.toLowerCase();
  // Reject common provider typos (e.g. gmail.co, yahoo.co, gmail.con, gmil.com)
  if (/^(gmail|yahoo|hotmail|outlook|icloud)\.co$/i.test(domainLower)) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Invalid email domain (did you mean .com?)' };
  }
  if (/^(gmail|yahoo|hotmail|outlook|icloud)\.(con|cm|cpm|om|comm|coom|cmo)$/i.test(domainLower)) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Invalid domain extension typo' };
  }
  if (/^(gmil|gamil|gmial|gmaill|gmai|gmal|gmall|gmaik|gmaii|gmeil|gml|gnail|gnal)(\.|$)/i.test(domainLower)) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Invalid email domain typo' };
  }
  if (!nurseEmailRegex.test(trimmed.toLowerCase())) {
    return { isValid: false, code: 'INVALID_EMAIL', message: 'Invalid email address format' };
  }
  return { isValid: true, normalizedEmail: trimmed.toLowerCase() };
}


export const nurseEmailSchema = z.string()
  .trim()
  .toLowerCase()
  .min(1, 'Email address is required')
  .regex(nurseEmailRegex, 'Invalid email address format');

export const nurseCreateSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: nurseEmailSchema,
  phone: optionalPhoneSchema,
  password: nursePasswordSchema,
  clinicId: z.string().min(1, 'Clinic ID is required'),
  wardId: z.string().min(1, 'Assigned ward is required'),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  avatarUrl: z.string().optional().nullable().or(z.literal('')),
  photo: z.string().optional().nullable().or(z.literal(''))
});

export const nurseUpdateSchema = z.object({
  email: nurseEmailSchema.optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: optionalPhoneSchema,
  wardId: z.string().optional(),
  password: nursePasswordSchema.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  avatarUrl: z.string().optional().nullable().or(z.literal('')),
  photo: z.string().optional().nullable().or(z.literal('')),
  removePhoto: z.boolean().optional()
});

export const ipdAdmissionSchema = z.object({
  patientId: z.string().min(1, 'Patient ID is required'),
  wardId: z.string().min(1, 'Ward ID is required'),
  bedId: z.string().min(1, 'Bed ID is required'),
  assignedNurseId: z.string().optional(),
  nurseId: z.string().optional(),
  diagnosis: z.string().optional().nullable().or(z.literal('')),
  provisionalDiagnosis: z.string().optional().nullable().or(z.literal('')),
  admissionReason: z.string().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable().or(z.literal('')),
  clinicId: z.string().optional(),
  doctorId: z.string().optional()
}).refine(data => !!(data.assignedNurseId || data.nurseId), {
  message: 'Assigned Nurse ID is required',
  path: ['assignedNurseId']
});

export const consultingDoctorSchema = z.object({
  doctorId: z.string().min(1, 'Doctor ID is required'),
  specialty: z.string().optional().nullable(),
  consultationReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export function calculateVitalFlags(vitals) {
  if (!vitals) return [];
  const flags = [];
  if (vitals.pulse !== undefined && vitals.pulse !== null && !isNaN(Number(vitals.pulse))) {
    const p = Number(vitals.pulse);
    if (p > 100) flags.push({ key: 'pulse', label: 'Tachycardia', value: `${p} bpm`, severity: 'warning' });
    else if (p < 60) flags.push({ key: 'pulse', label: 'Bradycardia', value: `${p} bpm`, severity: 'warning' });
  }
  if (vitals.temperature !== undefined && vitals.temperature !== null && !isNaN(Number(vitals.temperature))) {
    const t = Number(vitals.temperature);
    if (t >= 100.4) flags.push({ key: 'temperature', label: 'Fever / Pyrexia', value: `${t}°F`, severity: 'warning' });
    else if (t < 95) flags.push({ key: 'temperature', label: 'Hypothermia', value: `${t}°F`, severity: 'warning' });
  }
  if (vitals.spo2 !== undefined && vitals.spo2 !== null && !isNaN(Number(vitals.spo2))) {
    const s = Number(vitals.spo2);
    if (s < 90) flags.push({ key: 'spo2', label: 'Critical Hypoxemia', value: `${s}%`, severity: 'critical' });
    else if (s < 95) flags.push({ key: 'spo2', label: 'Low Oxygen Saturation', value: `${s}%`, severity: 'warning' });
  }
  if (vitals.bp && typeof vitals.bp === 'string' && vitals.bp.includes('/')) {
    const parts = vitals.bp.split('/');
    const sys = parseInt(parts[0], 10);
    const dia = parseInt(parts[1], 10);
    if (!isNaN(sys) && !isNaN(dia)) {
      if (sys >= 140 || dia >= 90) {
        flags.push({ key: 'bp', label: 'Hypertension', value: vitals.bp, severity: 'warning' });
      } else if (sys < 90 || dia < 60) {
        flags.push({ key: 'bp', label: 'Hypotension', value: vitals.bp, severity: 'warning' });
      }
    }
  }
  return flags;
}

export const nursingNoteSchema = z.object({
  noteType: z.string().optional().default('Nursing Note'),
  note_type: z.string().optional().nullable(),
  nursing_observations: z.string().optional().nullable(),
  nursingObservations: z.string().optional().nullable(),
  observations: z.string().optional().nullable(),
  patient_condition: z.string().optional().nullable(),
  patientCondition: z.string().optional().nullable(),
  interventions: z.string().optional().nullable(),
  care_provided: z.string().optional().nullable(),
  careProvided: z.string().optional().nullable(),
  handover_notes: z.string().optional().nullable(),
  handoverNotes: z.string().optional().nullable(),
  follow_up_notes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  recorded_at: z.string().optional().nullable(),
  recordedAt: z.string().optional().nullable(),
  clinicId: z.string().optional().nullable(),
  vitals: z.object({
    bp: z.string().trim().regex(/^(\d{2,3}\/\d{2,3})?$/, 'BP must be in standard mmHg format (e.g. 120/80)').optional().nullable(),
    pulse: z.coerce.number({ invalid_type_error: 'Pulse must be a valid number' })
      .min(10, 'Pulse reading must be at least 10 bpm')
      .max(350, 'Pulse reading cannot exceed 350 bpm')
      .optional().nullable(),
    temperature: z.coerce.number({ invalid_type_error: 'Temperature must be a valid number' })
      .min(60, 'Temperature must be at least 60°F')
      .max(120, 'Temperature cannot exceed 120°F')
      .optional().nullable(),
    spo2: z.coerce.number({ invalid_type_error: 'SpO2 must be a valid number' })
      .min(0, 'SpO2 cannot be negative')
      .max(100, 'SpO2 cannot exceed 100%')
      .optional().nullable(),
  }).optional().nullable()
}).superRefine((data, ctx) => {
  const text = (
    data.notes ||
    data.note ||
    data.nursing_observations ||
    data.nursingObservations ||
    data.observations ||
    data.patient_condition ||
    data.patientCondition ||
    data.interventions ||
    data.care_provided ||
    data.careProvided ||
    data.handover_notes ||
    data.handoverNotes ||
    data.follow_up_notes ||
    ''
  ).trim();
  if (!text) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Nursing note content cannot be empty',
      path: ['note']
    });
  }
});

export const clinicalNoteSchema = z.object({
  notes: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  noteType: z.string().optional().default('Doctor Round'),
  note_type: z.string().optional().nullable(),
  clinical_findings: z.string().optional().nullable(),
  clinicalFindings: z.string().optional().nullable(),
  findings: z.string().optional().nullable(),
  patient_condition: z.string().optional().nullable(),
  patientCondition: z.string().optional().nullable(),
  assessment: z.string().optional().nullable(),
  doctor_assessment: z.string().optional().nullable(),
  doctorAssessment: z.string().optional().nullable(),
  treatment_plan: z.string().optional().nullable(),
  treatmentPlan: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
  round_time: z.string().optional().nullable(),
  recorded_at: z.string().optional().nullable(),
  recordedAt: z.string().optional().nullable(),
  vitals: z.object({
    bp: z.string().trim().regex(/^(\d{2,3}\/\d{2,3})?$/, 'BP must be in standard mmHg format (e.g. 120/80)').optional().nullable(),
    pulse: z.coerce.number({ invalid_type_error: 'Pulse must be a valid number' })
      .min(10, 'Pulse reading must be at least 10 bpm')
      .max(350, 'Pulse reading cannot exceed 350 bpm')
      .optional().nullable(),
    temperature: z.coerce.number({ invalid_type_error: 'Temperature must be a valid number' })
      .min(60, 'Temperature must be at least 60°F')
      .max(120, 'Temperature cannot exceed 120°F')
      .optional().nullable(),
    spo2: z.coerce.number({ invalid_type_error: 'SpO2 must be a valid number' })
      .min(0, 'SpO2 cannot be negative')
      .max(100, 'SpO2 cannot exceed 100%')
      .optional().nullable(),
  }).optional().nullable(),
  isVoided: z.boolean().optional(),
  voidReason: z.string().optional().nullable(),
  correctionReason: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  action: z.string().optional().nullable(),
  clinicId: z.string().optional().nullable()
}).superRefine((data, ctx) => {
  if (data.isVoided || data.action === 'void') {
    return;
  }
  const text = (
    data.notes ||
    data.note ||
    data.clinical_findings ||
    data.clinicalFindings ||
    data.findings ||
    data.assessment ||
    data.doctor_assessment ||
    data.doctorAssessment ||
    data.treatment_plan ||
    data.treatmentPlan ||
    data.instructions ||
    data.plan ||
    ''
  ).trim();
  if (!text) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Clinical note or doctor round content cannot be empty',
      path: ['note']
    });
  }
});

export const bedCleanedSchema = z.object({
  reason: z.string().optional().default('Cleaning completed'),
});

export const vitalsScheduleSchema = z.object({
  clinicId: z.string().optional(),
  frequency: z.enum(['none', '1h', '2h', '4h', '6h', '8h', '12h', '24h']).nullable().optional(),
  frequencyHours: z.number().int().positive().nullable().optional(),
  notes: z.string().max(255).optional().nullable()
});

export const ipdPrescriptionSchema = z.object({
  medication_name: z.string().trim().min(1, 'Medication name is required'),
  dosage: z.string().trim().min(1, 'Prescribed dosage is required'),
  route: z.string().trim().min(1, 'Route of administration is required'),
  frequency: z.string().trim().min(1, 'Frequency is required'),
  schedule: z.union([z.array(z.string()), z.string()]).optional().nullable(),
  instructions: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  clinicId: z.string().optional().nullable(),
});

export const marRecordSchema = z.object({
  prescription_id: z.string().trim().min(1, 'Prescription ID is required'),
  status: z.enum(['ADMINISTERED', 'MISSED', 'REFUSED'], {
    errorMap: () => ({ message: 'Status must be ADMINISTERED, MISSED, or REFUSED' })
  }),
  scheduled_time: z.string().optional().nullable(),
  administered_at: z.string().optional().nullable(),
  dose_given: z.string().optional().nullable(),
  route: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  clinicId: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if ((data.status === 'MISSED' || data.status === 'REFUSED') && (!data.reason || data.reason.trim().length < 3)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A mandatory clinical reason is required when recording a dose as ' + data.status + '.',
      path: ['reason']
    });
  }
});

export const discontinuePrescriptionSchema = z.object({
  reason: z.string().trim().min(3, 'A clinical reason is mandatory to discontinue medication (minimum 3 characters).'),
  discontinuation_reason: z.string().optional().nullable(),
  discontinued_at: z.string().optional().nullable(),
  clinicId: z.string().optional().nullable(),
});


export const createRadiologyOrderSchema = z.object({
  lab_id: z.string().trim().min(1, 'Destination laboratory is required.').optional().or(z.literal('')),
  labId: z.string().trim().min(1, 'Destination laboratory is required.').optional().or(z.literal('')),
  lab_name: z.string().optional().nullable(),
  labName: z.string().optional().nullable(),
  investigation_type: z.enum(['X-Ray', 'CT Scan', 'Ultrasound', 'MRI', 'Other'], {
    errorMap: () => ({ message: 'Investigation type must be X-Ray, CT Scan, Ultrasound, MRI, or Other' })
  }),
  study_name: z.string().trim().min(2, 'Study name is required (minimum 2 characters).'),
  clinical_indication: z.string().trim().min(3, 'A clinical indication is mandatory (minimum 3 characters).'),
  priority: z.enum(['routine', 'urgent', 'critical_stat']).optional().default('routine'),
  instructions: z.string().optional().nullable(),
  transport_mode: z.string().optional().nullable(),
  clinicId: z.string().optional().nullable(),
  price: z.number().nonnegative().optional().nullable(),
  amount: z.number().nonnegative().optional().nullable(),
  tariff: z.number().nonnegative().optional().nullable(),
  total_amount: z.number().nonnegative().optional().nullable()
});

export const updateRadiologyStatusSchema = z.object({
  status: z.enum(['ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], {
    errorMap: () => ({ message: 'Status must be ORDERED, IN_PROGRESS, COMPLETED, or CANCELLED' })
  }),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  clinicId: z.string().optional().nullable(),
});

export const attachRadiologyReportSchema = z.object({
  findings: z.string().trim().min(3, 'Diagnostic findings are required (minimum 3 characters).'),
  impression: z.string().trim().min(3, 'Diagnostic impression is required (minimum 3 characters).'),
  file_url: z.string().optional().nullable(),
  file_name: z.string().optional().nullable(),
  file_size: z.number().optional().nullable(),
  mime_type: z.string().optional().nullable(),
  recommendations: z.string().optional().nullable(),
  critical_findings: z.boolean().optional().default(false),
  clinicId: z.string().optional().nullable(),
});
