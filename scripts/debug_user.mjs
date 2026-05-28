import dbConnect from '../src/utils/db.js';
import Staff from '../src/models/Staff.js';

async function run() {
  await dbConnect();
  const staff = await Staff.findOne({ email: 'samiksha@gmail.com' });
  console.log('STAFF RECORD:', JSON.stringify(staff, null, 2));
  process.exit(0);
}
run().catch(console.error);
