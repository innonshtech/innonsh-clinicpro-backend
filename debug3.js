import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PatientSchema = new mongoose.Schema({ clinicId: String, firstName: String, lastName: String, patientId: String }, { strict: false });
const Patient = mongoose.model('Patient', PatientSchema);

const ApptSchema = new mongoose.Schema({ patientId: mongoose.Schema.Types.ObjectId, doctorId: mongoose.Schema.Types.ObjectId, status: String }, { strict: false });
const Appointment = mongoose.model('Appointment', ApptSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const userId = '69e3b2411bfff34671846e73'; // Dr Rohit

  const appointments = await Appointment.find({ doctorId: userId }).select('patientId');
  const assignedPatientIds = [...new Set(appointments.map(a => a.patientId?.toString()).filter(id => id))];
  
  const matchStage = { _id: { $in: assignedPatientIds.map(id => new mongoose.Types.ObjectId(id)) } };

  console.log('Match Stage:', matchStage);

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
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: "totalCount" }],
        data: [
          { $skip: 0 },
          { $limit: 10 },
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

  console.log('Results Total:', results[0]?.metadata[0]?.totalCount || 0);
  console.log('Results Sample:', results[0]?.data.slice(0, 2).map(p => ({name: p.firstName + ' ' + p.lastName, lastVisit: p.lastVisit})));

  await mongoose.disconnect();
}

run().catch(console.error);
