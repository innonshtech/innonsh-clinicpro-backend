import mongoose from "mongoose";
import { ROLES, ROLE_LIST } from "../constants/roles";

const adminSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ROLE_LIST,
    default: ROLES.ADMIN 
  },
}, { timestamps: true });

export default mongoose.models.Admin || mongoose.model("Admin", adminSchema);
