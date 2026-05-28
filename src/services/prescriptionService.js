import Visit from '@/models/Visit';
import Appointment from '@/models/Appointments';
import dbConnect from '@/utils/db';
import mongoose from 'mongoose';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';


/**
 * Service to add a prescription to an ongoing or completed visit.
 */
export const addPrescription = async (payload, user) => {
  await dbConnect();
  const { visit_id, medicines } = payload;
  
  const query = mongoose.Types.ObjectId.isValid(visit_id) 
    ? { _id: visit_id } 
    : null;
    
  if (!query) throw new AppError('Invalid Visit ID format', 400, 'INVALID_ID');


  const visit = await Visit.findOne(query);
  
  if (!visit) throw new AppError('Visit not found', 404, 'NOT_FOUND');

  
  // Enforce Scoping
  if (user.role.toLowerCase() === 'doctor' && visit.doctorId.toString() !== user.id) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }


  // Update medicines array
  visit.medicines = medicines;
  await visit.save();

  // Also update the underlying appointment so the legacy history views keep working instantly
  await Appointment.updateOne(
    { _id: visit.appointmentId },
    { $set: { medicines: medicines } }
  );

  // Audit Log
  await auditService.recordLog({
    user,
    action: 'CREATE_PRESCRIPTION',
    resourceType: 'Visit',
    resourceId: visit._id.toString(),
    changes: {
      medicinesCount: medicines.length
    }
  });

  return visit;
};
