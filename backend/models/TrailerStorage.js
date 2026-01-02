import mongoose from 'mongoose';

const trailerStorageSchema = new mongoose.Schema({
    contentId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    tmdbId: {
        type: Number,
        required: true,
        index: true
    },
    mediaType: {
        type: String,
        enum: ['movie', 'tv'],
        required: true
    },
    title: {
        type: String,
        required: true,
        index: true
    },
    localPath: {
        type: String,
        required: true
    },
    fileSizeMB: {
        type: Number,
        required: true
    },
    videoQuality: {
        type: String,
        default: '1080p'
    },
    duration: Number,
    resolution: String,
    accessCount: {
        type: Number,
        default: 0
    },
    lastAccessed: {
        type: Date,
        default: Date.now
    },
    priority: {
        type: Number,
        default: 1,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Create indexes for faster queries
trailerStorageSchema.index({ mediaType: 1, isActive: 1 });
trailerStorageSchema.index({ lastAccessed: -1 });
trailerStorageSchema.index({ priority: -1, lastAccessed: -1 });

export default mongoose.model('TrailerStorage', trailerStorageSchema);