import { ApiResponse } from '@/utils/apiResponse';
import Doctor from '@/models/Doctor';
import dbConnect from '@/utils/db';

export async function GET() {
  await dbConnect();
  const doctors = await Doctor.find({});
  const debugInfo = doctors.map(doc => ({
    name: `${doc.firstName} ${doc.lastName}`,
    clinicId: doc.clinicId,
    available: doc.available,
    availableDays: doc.availableDays,
    sessionTime: doc.sessionTime
  }));
  return ApiResponse.success({ doctors: debugInfo });
}
