import "dotenv/config";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing");
}

if (mongoose.connection.readyState === 0) {
  await mongoose.connect(MONGODB_URI);

  console.log("MongoDB connected");
}

export default mongoose;