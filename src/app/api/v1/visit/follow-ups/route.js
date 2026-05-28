import { ApiResponse } from '@/utils/apiResponse';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import dbConnect from '@/utils/db';
import { withRoles } from '@/utils/authGuard';

/**
 * GET /api/v1/visit/follow-ups
 * Fetches all visits that have a follow-up date set for the current clinic.
 */
export const GET = withRoles(['receptionist', 'admin', 'doctor'], async (req) => {
    try {
        await dbConnect();
        const { clinicId } = req.user;

        if (!clinicId) {
            return ApiResponse.error('Clinic ID not found in session', 'FORBIDDEN', [], 403);
        }

        // Use aggregation to join Patient and Doctor info safely
        const visits = await Visit.aggregate([
            {
                $match: {
                    followUpDate: { $exists: true, $ne: null },
                    clinicId: clinicId // Direct match on clinicId for performance
                }
            },
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'doctorId',
                    foreignField: '_id',
                    as: 'doctorInfo'
                }
            },
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patientId',
                    foreignField: '_id',
                    as: 'patientInfo'
                }
            },
            {
                $project: {
                    _id: 1,
                    followUpDate: 1,
                    status: 1,
                    patientId: {
                        $ifNull: [
                            { $arrayElemAt: ['$patientInfo', 0] },
                            { firstName: 'Unknown', lastName: 'Patient' }
                        ]
                    },
                    doctorId: {
                        $ifNull: [
                            { $arrayElemAt: ['$doctorInfo', 0] },
                            { firstName: 'Unknown', lastName: 'Doctor' }
                        ]
                    }
                }
            },
            { $sort: { followUpDate: 1 } }
        ]);

        // Clean up the joined data to match the expected frontend format
        const formattedVisits = visits.map(v => ({
            ...v,
            patientId: {
                _id: v.patientId?._id,
                firstName: v.patientId?.firstName,
                lastName: v.patientId?.lastName,
                patientId: v.patientId?.patientId,
                phoneNumber: v.patientId?.phoneNumber
            },
            doctorId: {
                _id: v.doctorId?._id,
                firstName: v.doctorId?.firstName,
                lastName: v.doctorId?.lastName,
                specialty: v.doctorId?.specialty
            }
        }));

        return ApiResponse.success(formattedVisits, "Follow-up list fetched successfully");
    } catch (error) {
        console.error('Error fetching follow-ups:', error);
        return ApiResponse.error(error.message || 'Internal Server Error', 'SERVER_ERROR', [], 500);
    }
});
