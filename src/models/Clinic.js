// import mongoose from 'mongoose';

// const clinicSchema = new mongoose.Schema({
//   clinicName: { type: String,  required: true,},
//   clinicType: { type: String,   required: true,},
//   description: { type: String,},
//   registrationNumber: {type: String, required: true,unique: true,},
//   taxId: {type: String,required: true,},
//   specialties: {type: [String],default: [],},
//   logo: { type: String, },
//   website: {type: String,},
//   email: { type: String,},
//   phone: {type: String,},
//   password:{type:String},
//   images:[{type:String}],
//   address: { type: String, },
//   city: { type: String,},
//   state: {type: String,},
//   role:{type:String ,default:"clinic"},
//   postalCode: {type: String,},
//   country: {type: String,},
//   openingHours: {
//     monday: { open: { type: String, default: '' },close: { type: String, default: '' },},
//     tuesday:{ open: { type: String, default: '' },close: { type: String, default: '' },},
//     wednesday:{ open: { type: String, default: '' },close: { type: String, default: '' },},
//     thursday: { open: { type: String, default: '' },close: { type: String, default: '' },},
//     friday: { open: { type: String, default: '' },close: { type: String, default: '' },},
//     saturday: { open: { type: String, default: '' },close: { type: String, default: '' },},
//     sunday: { open: { type: String, default: '' },close: { type: String, default: '' },},
//   }
// }, {
//   timestamps: true,
// });

// export default mongoose.models.Clinic || mongoose.model('Clinic', clinicSchema);
import mongoose from 'mongoose';
import { ROLES, ROLE_LIST } from "../constants/roles";

const clinicSchema = new mongoose.Schema({
  clinicName: { type: String },
  clinicType: { type: String },
  description: { type: String },
  registrationNumber: { type: String, unique: true, sparse: true },
  taxId: { type: String },
  specialties: { type: [String], default: [] },
  logo: { type: String },
  website: { type: String },
  email: { type: String },
  phone: { type: String },
  password: { type: String },
  images: [{ type: String }],
  address: { type: String },
  city: { type: String },
  state: { type: String },
  postalCode: { type: String },
  country: { type: String },
  role: { 
    type: String, 
    enum: ROLE_LIST,
    default: ROLES.CLINIC 
  },

licenseDocument: { type: Object },
gstDocument: { type: Object }, // URL or filename
  licenseDocumentUrl: { type: String },
rejectionReason:{type:String},
  gstDocumentUrl: { type: String },

  is24x7: { type: Boolean, default: false },
status:{type:String,default:'pending'},
  openingHours: {
    monday: { open: { type: String, default: '' }, close: { type: String, default: '' } },
    tuesday: { open: { type: String, default: '' }, close: { type: String, default: '' } },
    wednesday: { open: { type: String, default: '' }, close: { type: String, default: '' } },
    thursday: { open: { type: String, default: '' }, close: { type: String, default: '' } },
    friday: { open: { type: String, default: '' }, close: { type: String, default: '' } },
    saturday: { open: { type: String, default: '' }, close: { type: String, default: '' } },
    sunday: { open: { type: String, default: '' }, close: { type: String, default: '' } },
  },
}, { timestamps: true });
export default mongoose.models.Clinic || mongoose.model('Clinic', clinicSchema);
