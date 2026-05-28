import mongoose from "mongoose";
import Patient from '../models/Patient';
import Counter from '../models/Counter';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
}

let migrationStarted = false;
async function runBackgroundMigration() {
  if (migrationStarted) return;
  migrationStarted = true;
  try {
    const patients = await Patient.find({ patientCode: { $exists: false } });
    if (patients.length > 0) {
      console.log(`[MIGRATION] Migrating ${patients.length} patients.`);
      for (const p of patients) {
        const counter = await Counter.findByIdAndUpdate(
          { _id: 'patient_code' },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
        p.patientCode = `PAT-${String(counter.seq).padStart(6, '0')}`;
        await p.save();
      }
      console.log('[MIGRATION] Patient code migrations completed successfully.');
    }
  } catch (err) {
    console.error('[MIGRATION ERROR]', err);
  }
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log("✅ MongoDB connected successfully");
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
    runBackgroundMigration();
  } catch (e) {
    cached.promise = null;
    console.error("❌ MongoDB connection failed:", e.message);
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
