import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const patientRegistrationSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email format'),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.string().min(1, 'Gender is required'),
  bloodGroup: z.string().optional().nullable().or(z.literal('')),
  emergencyContact: z.string().optional().nullable().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
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
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  phone: z.string().optional().nullable().or(z.literal('')),
  specialty: z.string().optional().nullable().or(z.literal('')),
  experience: z.number().optional().nullable().or(z.string().optional()).transform(val => Number(val) || 0),
  hospital: z.string().optional().nullable().or(z.literal('')),
  
  // Optional / Allowable fields
  supSpeciality: z.string().optional(),
  consultantFee: z.number().optional().or(z.string().optional()).transform(val => Number(val) || undefined),
  qualifications: z.array(z.string()).optional(),
  licenseNumber: z.string().optional(),
  sessionTime: z.string().optional(),
  hospitalAddress: z.string().optional(),
  hospitalNumber: z.string().optional(),
  clinicId: z.string().optional(),
  degreeCertificate: z.string().optional(),
  identityProof: z.string().optional(),
  status: z.string().optional(),
  available: z.object({
    days: z.array(z.string()).optional(),
    time: z.string().optional()
  }).optional()
});

export const clinicRegistrationSchema = z.object({
  clinicName: z.string().optional().nullable().or(z.literal('')),
  clinicType: z.string().optional().nullable().or(z.literal('')),
  registrationNumber: z.string().optional().nullable().or(z.literal('')),
  taxId: z.string().optional().nullable().or(z.literal('')),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  phone: z.string().optional().nullable().or(z.literal('')),
  
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
  images: z.array(z.string()).optional().nullable(),
  licenseDocument: z.any().optional().nullable(),
  licenseDocumentUrl: z.string().optional().nullable(),
  gstDocument: z.any().optional().nullable(),
  gstDocumentUrl: z.string().optional().nullable(),
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



