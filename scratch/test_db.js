const mongoose = require('mongoose');
const uri = "mongodb+srv://xpertance:XPERTANCE@cluster0.dnv2io.mongodb.net/Doctor_ERP?retryWrites=true&w=majority";

async function test() {
  console.log("Testing connection...");
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    console.log("✅ Connected!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed:", err.message);
    process.exit(1);
  }
}

test();
