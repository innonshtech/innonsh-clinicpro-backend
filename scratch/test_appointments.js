const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/doctor_erp', { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection;
  const count = await db.collection('appointments').countDocuments();
  console.log('Total appointments:', count);
  
  const bookedCount = await db.collection('appointments').countDocuments({ status: 'booked' });
  console.log('Booked appointments:', bookedCount);

  const apps = await db.collection('appointments').find({}).toArray();
  console.log('Sample appointments:', JSON.stringify(apps.slice(0, 2), null, 2));

  process.exit(0);
}

test().catch(console.error);
