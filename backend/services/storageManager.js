// storageManager.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import TrailerStorage from '../models/TrailerStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MAX_STORAGE_GB = process.env.MAX_STORAGE_GB || 1000;
const MAX_VIDEOS = process.env.MAX_VIDEOS || 500;

class StorageManager {
    constructor() {
        this.trailerPath = null;
        this.initialized = false; // Track initialization state
    }
    
    async init() {
        if (this.initialized) return;
        
        try {
            console.log('🔍 Storage Manager Initialization:');
            console.log('   EXTERNAL_HDD_PATH from env:', process.env.EXTERNAL_HDD_PATH);
            console.log('   Current working directory:', process.cwd());
            
            // Try to get from environment variable first
            if (process.env.EXTERNAL_HDD_PATH) {
                this.trailerPath = path.join(process.env.EXTERNAL_HDD_PATH, 'trailers');
                console.log('   Using EXTERNAL_HDD_PATH:', this.trailerPath);
            } else {
                // Auto-detect or use default
                this.trailerPath = path.join(__dirname, '../../local-trailers');
                console.log('   Using fallback path:', this.trailerPath);
            }
            
            // Create directory if it doesn't exist
            console.log('   Checking if path exists:', fs.existsSync(this.trailerPath));
            if (!fs.existsSync(this.trailerPath)) {
                fs.mkdirSync(this.trailerPath, { recursive: true });
                console.log(`📁 Created trailer directory: ${this.trailerPath}`);
            }
            
            this.initialized = true;
            console.log(`✅ Storage initialized at: ${this.trailerPath}`);
            
        } catch (error) {
            console.error('❌ Storage initialization failed:', error);
            // Fallback to temp directory
            this.trailerPath = './temp-trailers';
            if (!fs.existsSync(this.trailerPath)) {
                fs.mkdirSync(this.trailerPath, { recursive: true });
            }
            console.log(`🔄 Fell back to: ${this.trailerPath}`);
            this.initialized = true;
        }
    }
    
    // Add a check to ensure init was called
    ensureInitialized() {
        if (!this.initialized) {
            throw new Error('StorageManager not initialized. Call init() first.');
        }
    }
    
    getStoragePath() {
        this.ensureInitialized();
        return this.trailerPath;
    }
    
    // Simplified: Always MP4
    getVideoPath(contentId) {
        this.ensureInitialized();
        return path.join(this.trailerPath, `${contentId}.mp4`);
    }
    
    async videoExists(contentId) {
        this.ensureInitialized();
        // Check for MP4 file only
        const filePath = this.getVideoPath(contentId);
        return fs.existsSync(filePath);
    }
    
    async saveVideo(contentId, tempFilePath, metadata) {
        this.ensureInitialized();
        let session = null;
        let finalPath = null;
        
        try {
            // Import mongoose for transaction
            const mongoose = await import('mongoose');
            
            // Ensure temp file exists
            if (!fs.existsSync(tempFilePath)) {
                throw new Error(`Temp file not found: ${tempFilePath}`);
            }
            
            // Always MP4
            finalPath = this.getVideoPath(contentId);
            
            console.log(`💾 Saving ${contentId} to: ${finalPath}`);
            
            // Move temp file to final location
            fs.copyFileSync(tempFilePath, finalPath);
            
            // Get file stats
            const stats = fs.statSync(finalPath);
            console.log(`📊 File size: ${(stats.size/(1024*1024)).toFixed(2)}MB`);
            
            // Start transaction to prevent race conditions
            session = await mongoose.startSession();
            session.startTransaction();
            
            // Check if record already exists (in transaction)
            const existing = await TrailerStorage.findOne({ contentId: contentId }).session(session);
            
            if (existing) {
                console.log(`🔄 Updating existing record: ${contentId}`);
                
                // Update existing record
                existing.localPath = finalPath;
                existing.fileSizeMB = stats.size / (1024 * 1024);
                existing.format = 'mp4';  // Always MP4
                existing.extension = 'mp4';  // Always MP4
                existing.updatedAt = new Date();
                existing.isActive = true;
                
                await existing.save({ session });
            } else {
                // Create new record
                const storageRecord = new TrailerStorage({
                    contentId: contentId,
                    tmdbId: metadata.tmdbId,
                    mediaType: metadata.mediaType,
                    title: metadata.title,
                    localPath: finalPath,
                    fileSizeMB: stats.size / (1024 * 1024),
                    videoQuality: '1080p',
                    format: 'mp4',  // Always MP4
                    extension: 'mp4',  // Always MP4
                    priority: metadata.priority || 1
                });
                
                await storageRecord.save({ session });
            }
            
            // Commit transaction
            await session.commitTransaction();
            
            console.log(`✅ Video saved: ${contentId}`);
            
            // Check if we need cleanup
            await this.checkAndCleanup();
            
            return {
                success: true,
                path: finalPath,
                sizeMB: stats.size / (1024 * 1024)
            };
            
        } catch (error) {
            // Rollback transaction on error
            if (session) {
                await session.abortTransaction();
            }
            
            console.error('❌ Save video failed:', error.message);
            
            // Cleanup temp file if save failed
            if (finalPath && fs.existsSync(finalPath)) {
                fs.unlinkSync(finalPath);
                console.log(`🧹 Cleaned up failed save: ${finalPath}`);
            }
            
            throw error;
        } finally {
            if (session) {
                session.endSession();
            }
        }
    }
    
    async getVideoInfo(contentId) {
        this.ensureInitialized();
        try {
            const record = await TrailerStorage.findOne({
                contentId: contentId,
                isActive: true
            });
            
            if (!record) return null;
            
            // Check if file still exists
            if (!fs.existsSync(record.localPath)) {
                // Mark as inactive
                record.isActive = false;
                await record.save();
                return null;
            }
            
            // Update access stats
            record.accessCount += 1;
            record.lastAccessed = new Date();
            await record.save();
            
            return {
                path: record.localPath,
                record: record
            };
            
        } catch (error) {
            console.error('❌ Get video info failed:', error);
            return null;
        }
    }
    
    async checkAndCleanup() {
        this.ensureInitialized();
        try {
            // Get storage stats
            const stats = await this.getStorageStats();
            
            if (stats.usedGB > (MAX_STORAGE_GB * 0.9) || 
                stats.fileCount > (MAX_VIDEOS * 0.9)) {
                console.log('🧹 Storage near limit, starting cleanup...');
                await this.cleanup();
            }
            
        } catch (error) {
            console.error('❌ Cleanup check failed:', error);
        }
    }
    
    async getStorageStats() {
        this.ensureInitialized();
        try {
            // Only look for MP4 files
            const files = fs.readdirSync(this.trailerPath)
                .filter(f => f.endsWith('.mp4'));
            
            let totalSize = 0;
            
            for (const file of files) {
                const filePath = path.join(this.trailerPath, file);
                try {
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;
                } catch (err) {
                    console.log(`⚠️ Could not stat file: ${file}`, err.message);
                }
            }
            
            return {
                fileCount: files.length,
                totalSize: totalSize,
                usedGB: totalSize / (1024 * 1024 * 1024),
                freeGB: MAX_STORAGE_GB - (totalSize / (1024 * 1024 * 1024)),
                maxFiles: MAX_VIDEOS,
                maxGB: MAX_STORAGE_GB
            };
            
        } catch (error) {
            console.error('❌ Get storage stats failed:', error);
            return { fileCount: 0, usedGB: 0, freeGB: MAX_STORAGE_GB };
        }
    }
    
    async cleanup() {
        this.ensureInitialized();
        try {
            console.log('🧹 Starting storage cleanup...');
            
            // Find videos to delete (low priority, least accessed)
            const candidates = await TrailerStorage.find({
                isActive: true,
                priority: 1  // Low priority first
            })
            .sort({ 
                lastAccessed: 1,  // Oldest first
                accessCount: 1    // Least accessed first
            })
            .limit(10);  // Delete 10 at a time
            
            let deletedCount = 0;
            
            for (const video of candidates) {
                try {
                    // Delete file
                    if (video.localPath && fs.existsSync(video.localPath)) {
                        fs.unlinkSync(video.localPath);
                    }
                    
                    // Mark as inactive
                    video.isActive = false;
                    video.localPath = null;
                    await video.save();
                    
                    deletedCount++;
                    console.log(`   Deleted: ${video.title}`);
                    
                } catch (err) {
                    console.log(`   Failed to delete: ${video.title}`, err.message);
                }
            }
            
            console.log(`✅ Cleanup completed: ${deletedCount} videos removed`);
            return deletedCount;
            
        } catch (error) {
            console.error('❌ Cleanup failed:', error);
            return 0;
        }
    }
    
    async getStorageStatus() {
        this.ensureInitialized();
        const stats = await this.getStorageStats();
        const dbStats = await TrailerStorage.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: null,
                    totalVideos: { $sum: 1 },
                    totalSizeGB: { $sum: { $divide: ["$fileSizeMB", 1024] } },
                    avgAccessCount: { $avg: "$accessCount" }
                }
            }
        ]);
        
        return {
            storagePath: this.trailerPath,
            storageStats: stats,
            databaseStats: dbStats[0] || {},
            hddConnected: fs.existsSync(this.trailerPath)
        };
    }
}

// Create single instance but don't auto-initialize
const storageManager = new StorageManager();
export default storageManager;