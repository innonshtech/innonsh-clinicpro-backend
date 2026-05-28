import dbConnect from '../src/utils/db.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function dropStaleIndexes() {
  await dbConnect();
  
  const db = mongoose.connection.db;
  const collection = db.collection('appointments');
  
  // List all indexes
  const indexes = await collection.indexes();
  console.log('Current indexes on appointments:');
  indexes.forEach(idx => {
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} ${idx.unique ? '(UNIQUE)' : ''}`);
  });

  // Drop stale indexes that are not in the current schema
  const staleIndexes = ['patientEmail_1', 'patientNumber_1', 'patientNote_1'];
  
  for (const indexName of staleIndexes) {
    const exists = indexes.find(idx => idx.name === indexName);
    if (exists) {
      console.log(`\nDropping stale index: ${indexName}`);
      await collection.dropIndex(indexName);
      console.log(`  ✅ Dropped ${indexName}`);
    }
  }

  console.log('\nDone. Updated indexes:');
  const updatedIndexes = await collection.indexes();
  updatedIndexes.forEach(idx => {
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} ${idx.unique ? '(UNIQUE)' : ''}`);
  });

  process.exit(0);
}

dropStaleIndexes().catch(err => {
  console.error(err);
  process.exit(1);
});
