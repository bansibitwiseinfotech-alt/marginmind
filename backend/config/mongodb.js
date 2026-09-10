import mongoose from "mongoose";

const connectMongoDB = async () => {
    try {
        await mongoose.connect(
            process.env.MONGODB_URI
        );

        console.log("MongoDB connected");
    } catch (error) {
        console.error(
            "MongoDB connection error:",
            error.message
        );

        process.exit(1);
    }
};

export default connectMongoDB;