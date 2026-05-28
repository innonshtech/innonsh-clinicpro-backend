// Use native fetch
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const JWT_SECRET = process.env.JWT_SECRET;
const token = jwt.sign(
  {
    id: '69e3b2411bfff34671846e73',
    role: 'doctor',
    clinicId: '69e39c0a1bfff34671846da8',
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

async function run() {
  const payload = {
    appointment_id: '6a140c9c39d012377fd3e791',
    // Let's pass what we think the frontend passes
    doctor_id: '69e3b2411bfff34671846e73',
    patient_id: '69ee21c6af360d65214b1d74',
    clinicId: '69e39c0a1bfff34671846da8'
  };

  const res = await fetch('http://localhost:3001/api/v1/visit/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}

run().catch(console.error);
