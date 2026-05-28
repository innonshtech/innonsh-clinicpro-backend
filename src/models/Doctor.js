import mongoose from "mongoose";
import { ROLES, ROLE_LIST } from "../constants/roles";

const doctorSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  profileImage: { type: String },
  dateOfBirth: { type: String },
  gender: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  homeAddress:{type:String},
  phone: { type: String },
  specialty: { type: String },
  supSpeciality: { type: String, },
   identityProof: { type: String, },
      degreeCertificate: { type: String, },
  experience: { type: Number, default: 0 },
  consultantFee:{type:Number},
  qualifications: [String],
  licenseNumber: { type: String, },
  sessionTime:{type:String},
  hospital: { type: String },
  hospitalAddress: { type: String },
  clinicId: { type: String, alias: 'tenant_id', index: true },
  hospitalNumber:{ type: String, },
  isVerified: { type: Boolean, default: false },
  status:{type:String},
  role:{ 
    type: String, 
    enum: ROLE_LIST,
    default: ROLES.DOCTOR 
  },
  available:{
    days:[{ type: String,}],
    time:{ type: String,},
  },
  availableDays: [{ type: String }],
  availableTime: { type: String }
}, { timestamps: true });
// Ensure any existing model is replaced to apply new schema
export default mongoose.models.Doctor || mongoose.model("Doctor", doctorSchema);
