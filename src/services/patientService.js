import Patient from '@/models/Patient';
import Appointment from '@/models/Appointments';
import Doctor from '@/models/Doctor';
import Counter from '@/models/Counter';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';


/**
 * Service to handle patient registration logic.
 */
export const registerPatient = async (patientData) => {
  const {
    email,
    phoneNumber,
    password,
    ...otherData
  } = patientData;

  // 1. Check for duplicate email or phone number
  const existingPatient = await Patient.findOne({
    $or: [
      { email },
      { phoneNumber }
    ]
  });

  if (existingPatient) {
    const field = existingPatient.email === email ? 'Email' : 'Phone number';
    throw new AppError(`${field} already registered`, 409, 'DUPLICATE_ENTRY');
  }


  // 2. Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // 3. Auto-generate patientCode
  const counter = await Counter.findByIdAndUpdate(
    { _id: 'patient_code' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const patientCode = `PAT-${String(counter.seq).padStart(6, '0')}`;

  // 4. Create patient
  const newPatient = await Patient.create({
    ...otherData,
    email,
    phoneNumber,
    password: hashedPassword,
    patientCode,
    role: 'patient',
  });

  // 4. Return patient data without password
  const result = newPatient.toObject();
  delete result.password;

  return result;
};

/**
 * Internal helper to build the base scoping query for patients based on user role.
 */
const getPatientScopingQuery = async (user) => {
  const userId = user.id || user.userId;
  const clinicId = user.clinicId;
  const role = (user.role || '').toLowerCase();
  let scopingQuery = {};

  if (role === 'doctor') {
    // If clinicId is missing, we try to scoped by doctorId only
    if (!clinicId) {
      const appointments = await Appointment.find({ doctorId: userId }).select('patientId');
      const assignedPatientIds = [...new Set(appointments.map(a => a.patientId?.toString()).filter(id => id))];
      return { _id: { $in: assignedPatientIds.map(id => new mongoose.Types.ObjectId(id)) } };
    }

    // Always allow doctors to see all patients within their clinic
    scopingQuery = { clinicId };
  } else if (role === 'receptionist') {
    scopingQuery = clinicId ? { clinicId } : { _id: null }; // Block access if no clinicId
  } else if (role === 'admin') {
    scopingQuery = clinicId ? { clinicId } : {};
  } else if (role === 'clinic') {
    scopingQuery = { clinicId: userId }; // For clinic users, id is clinicId
  }

  return scopingQuery;
};

/**
 * Service to fetch paginated patient list with filters and role-based access.
 */
export const getPatients = async (user, filters) => {
  const { page, limit, name, phoneNumber, startDate, endDate } = filters;

  // 1. Get base scoping query
  const scopingQuery = await getPatientScopingQuery(user);

  // 2. Combine with search filters for the match stage
  let matchStage = { ...scopingQuery };

  if (user.role.toLowerCase() === 'receptionist') {
    // 1. Find all completed appointments for the clinic
    const completedAppointments = await Appointment.find({ 
      clinicId: user.clinicId, 
      status: 'completed' 
    }).select('patientId');
    
    const completedPatientIds = [...new Set(completedAppointments.map(a => a.patientId ? a.patientId.toString() : null).filter(id => id))];
    
    // 2. Set match stage to ONLY those patient IDs!
    matchStage = { _id: { $in: completedPatientIds.map(id => new mongoose.Types.ObjectId(id)) } };
  }

  if (name) {
    const searchRegex = new RegExp(name, 'i');
    matchStage.$or = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { phoneNumber: searchRegex },
      { patientId: searchRegex }
    ];
  }

  if (phoneNumber) {
    matchStage.phoneNumber = new RegExp(phoneNumber);
  }

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  // 3. Execute aggregation pipeline
  const skip = (page - 1) * limit;

  const results = await Patient.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'appointments',
        let: { pId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$patientId', '$$pId'] },
              status: 'completed'
            }
          },
          { $sort: { appointmentDate: -1, createdAt: -1 } },
          {
            $lookup: {
              from: 'doctors',
              localField: 'doctorId',
              foreignField: '_id',
              as: 'doctorInfo'
            }
          },
          { $unwind: { path: '$doctorInfo', preserveNullAndEmptyArrays: true } }
        ],
        as: 'completedAppointments'
      }
    },
    // Filter only completed consultations for the receptionist view
    ...(user.role.toLowerCase() === 'receptionist' ? [
      {
        $match: {
          completedAppointments: { $not: { $size: 0 } }
        }
      }
    ] : []),
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: "totalCount" }],
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $addFields: {
              lastAppointment: { $arrayElemAt: ['$completedAppointments', 0] }
            }
          },
          {
            $set: {
              lastVisit: '$lastAppointment.appointmentDate',
              doctor: {
                $cond: {
                  if: { $gt: [{ $strLenCP: { $ifNull: ['$lastAppointment.doctorInfo.firstName', ''] } }, 0] },
                  then: {
                    $concat: [
                      'Dr. ',
                      '$lastAppointment.doctorInfo.firstName',
                      ' ',
                      { $ifNull: ['$lastAppointment.doctorInfo.lastName', ''] }
                    ]
                  },
                  else: null
                }
              }
            }
          },
          {
            $project: {
              password: 0,
              completedAppointments: 0,
              lastAppointment: 0
            }
          }
        ]
      }
    }
  ]);

  const patients = results[0]?.data || [];
  const totalCount = results[0]?.metadata[0]?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return {
    patients,
    pagination: {
      totalCount,
      totalPages,
      currentPage: page,
      limit
    }
  };
};

/**
 * Service for efficient patient search across multiple fields with clinic scoping.
 */
export const searchPatients = async (user, { query: searchStr, limit }) => {
  // 1. Get base scoping query
  const scopingQuery = await getPatientScopingQuery(user);

  // 2. Build search query
  const searchRegex = new RegExp(searchStr, 'i');
  const query = {
    ...scopingQuery,
    $or: [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { phoneNumber: searchRegex },
      { patientId: searchRegex }
    ]
  };

  // 3. Execute search
  const patients = await Patient.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-password');

  return { patients };
};

/**
 * Service to fetch a single patient profile by ID with scoping.
 * @param {string} id - Either patientId (UUID) or MongoDB ObjectId
 * @param {object} user - Authenticated user context
 */
export const getPatientById = async (id, user) => {
  const userId = user.id || user.userId;
  const role = (user.role || '').toLowerCase();
  const clinicId = user.clinicId;

  // 1. Find patient by patientId (UUID) or _id (ObjectId)
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { patientId: id }] }
    : { patientId: id };

  const patient = await Patient.findOne(query).select('-password');

  if (!patient) {
    throw new AppError('Patient not found', 404, 'NOT_FOUND');
  }


  // 2. Enforce Scoping
  if (role === 'doctor') {
    return patient;
  } else if (role === 'receptionist') {
    // Must belong to the same clinic
    const patientClinicStr = patient.clinicId ? patient.clinicId.toString() : null;
    const userClinicStr = clinicId ? clinicId.toString() : null;

    if (!userClinicStr) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }

    if (patientClinicStr && patientClinicStr !== userClinicStr) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }

    // Self-heal legacy data: If patient has no clinicId, assign it
    if (!patientClinicStr) {
      patient.clinicId = userClinicStr;
      await patient.save();
    }

  } else if (role === 'clinic') {
    if (patient.clinicId !== userId) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }

  }

  return patient;
};
/**
 * Service to delete a patient by ID with scoping.
 * @param {string} id - Either patientId (UUID) or MongoDB ObjectId
 * @param {object} user - Authenticated user context
 */
export const deletePatient = async (id, user) => {
  const userId = user.id || user.userId;
  const role = (user.role || '').toLowerCase();
  const clinicId = user.clinicId;

  // 1. Find patient to verify existence and ownership
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { patientId: id }] }
    : { patientId: id };

  const patient = await Patient.findOne(query);

  if (!patient) {
    throw new AppError('Patient not found', 404, 'NOT_FOUND');
  }


  // 2. Enforce Scoping (Only admins and receptionists from the same clinic can delete)
  if (role === 'receptionist') {
    if (!clinicId || patient.clinicId !== clinicId) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }

  } else if (role === 'clinic') {
    if (patient.clinicId !== userId) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }
  } else if (role !== 'admin') {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }


  // 3. Delete patient
  await Patient.deleteOne({ _id: patient._id });

  return { id: patient._id, patientId: patient.patientId };
};

/**
 * Service to update patient details with scoping and unique checks.
 */
export const updatePatient = async (id, patientData, user) => {
  const userId = user.id || user.userId;
  const role = (user.role || '').toLowerCase();
  const clinicId = user.clinicId;

  // 1. Find existing patient to verify existence and scoping
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { patientId: id }] }
    : { patientId: id };

  const patient = await Patient.findOne(query);

  if (!patient) {
    throw new AppError('Patient not found', 404, 'NOT_FOUND');
  }


  // 2. Enforce Scoping
  if (role === 'receptionist') {
    if (!clinicId || patient.clinicId !== clinicId) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }

  } else if (role === 'clinic') {
    if (patient.clinicId !== userId) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }
  } else if (role !== 'admin') {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }


  // 3. Handle unique field updates (email, phoneNumber)
  if (patientData.email && patientData.email !== patient.email) {
    const existing = await Patient.findOne({ email: patientData.email });
    if (existing) throw new AppError('Email already registered', 409, 'DUPLICATE_ENTRY');

  }

  if (patientData.phoneNumber && patientData.phoneNumber !== patient.phoneNumber) {
    const existing = await Patient.findOne({ phoneNumber: patientData.phoneNumber });
    if (existing) throw new AppError('Phone number already registered', 409, 'DUPLICATE_ENTRY');

  }

  // 4. Update password if provided
  if (patientData.password) {
    patientData.password = await bcrypt.hash(patientData.password, 12);
  }

  // 5. Perform update
  const updatedPatient = await Patient.findByIdAndUpdate(
    patient._id,
    { $set: patientData },
    { new: true, runValidators: true }
  ).select('-password');

  // Audit Log
  await auditService.recordLog({
    user,
    action: 'UPDATE_PATIENT',
    resourceType: 'Patient',
    resourceId: updatedPatient.patientId || updatedPatient._id.toString(),
    changes: {
      updatedFields: Object.keys(patientData)
    }
  });

  return updatedPatient;
};

/**
 * Service to fetch patient records (placeholder for Visit Module integration).
 */
export const getPatientRecords = async (id, user) => {
  // 1. Verify existence and scoping by reuse of getPatientById logic
  // If unauthorized or not found, it will throw an error handled by the controller
  await getPatientById(id, user);

  // 2. Return records (placeholder: empty array for now as per ticket requirements)
  return { records: [] };
};
