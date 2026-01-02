import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import storageManager from './storageManager.js';

const execAsync = promisify(exec);

class DownloadService {
    constructor() {
        this.tempDir = './temp-downloads';
        this.locks = new Map(); // Track downloads in progress
        this.ensureTempDir();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        return this.tempDir;
    }

    // Acquire lock for a content ID
    acquireLock(contentId) {
        if (this.locks.has(contentId)) {
            return false; // Already being downloaded
        }
        this.locks.set(contentId, true);
        console.log(`🔒 Lock acquired for: ${contentId}`);
        return true;
    }

    // Release lock for a content ID
    releaseLock(contentId) {
        this.locks.delete(contentId);
        console.log(`🔓 Lock released for: ${contentId}`);
    }

    // Wait for lock with timeout
    async waitForLock(contentId, timeout = 30000) {
        const startTime = Date.now();

        while (this.locks.has(contentId)) {
            if (Date.now() - startTime > timeout) {
                throw new Error(`Timeout waiting for lock: ${contentId}`);
            }
            console.log(`⏳ Waiting for lock: ${contentId}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }

        return this.acquireLock(contentId);
    }

    // Download YouTube video as MP4 (1080p)
    async downloadYouTubeMP4(youtubeUrl, title) {
        const safeTitle = title.replace(/[^\w\s]/gi, '_').substring(0, 50);
        const tempFile = path.join(this.tempDir, `${safeTitle}_${Date.now()}.mp4`);

        console.log(`📥 Downloading: ${title}`);

        try {
            // Simple command for 1080p MP4 download
            const command = `yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]" \
                --merge-output-format mp4 \
                --no-check-certificate \
                --quiet \
                --no-warnings \
                -o "${tempFile}" \
                "${youtubeUrl}"`;

            console.log(`🔄 Downloading 1080p MP4...`);

            const { stdout, stderr } = await execAsync(command, {
                timeout: 300000 // 5 minutes timeout
            });

            // Check if file was created
            if (!fs.existsSync(tempFile)) {
                // Try alternative extension
                const altFile = tempFile.replace('.mp4', '.mkv');
                if (fs.existsSync(altFile)) {
                    fs.renameSync(altFile, tempFile);
                } else {
                    throw new Error('Downloaded file not found');
                }
            }

            const stats = fs.statSync(tempFile);
            console.log(`✅ Downloaded: ${title} (${(stats.size / (1024 * 1024)).toFixed(2)}MB)`);

            return {
                path: tempFile,
                format: 'mp4',
                sizeMB: stats.size / (1024 * 1024),
                extension: 'mp4'
            };

        } catch (error) {
            console.error('❌ Download failed:', error.message);

            // Cleanup on error
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }

            throw error;
        }
    }

    // Main download method - NO CHANGES TO LOGIC, JUST ADDED ASPECT RATIO LOGGING
    async downloadAndStore(contentId, youtubeUrl, metadata) {
        let lockAcquired = false;

        try {
            console.log('\n📥 DOWNLOAD AND STORE DEBUG:');
            console.log('   contentId:', contentId);
            console.log('   youtubeUrl:', youtubeUrl);
            console.log('   metadata:', metadata);
            
            // FIRST: Check if already exists in database (proper check)
            const TrailerStorage = (await import('../models/TrailerStorage.js')).default;
            const existingRecord = await TrailerStorage.findOne({ contentId: contentId });

            if (existingRecord && existingRecord.isActive) {
                // Check if file actually exists
                if (fs.existsSync(existingRecord.localPath)) {
                    console.log(`📦 Video already exists: ${contentId}`);
                    return existingRecord.localPath;
                } else {
                    // File doesn't exist, mark as inactive
                    console.log(`⚠️ File missing, marking as inactive: ${contentId}`);
                    existingRecord.isActive = false;
                    await existingRecord.save();
                }
            }

            // SECOND: Acquire lock to prevent duplicate downloads
            lockAcquired = await this.waitForLock(contentId);
            if (!lockAcquired) {
                throw new Error(`Could not acquire lock for ${contentId}`);
            }

            // THIRD: Double-check after acquiring lock (in case another request finished)
            const doubleCheck = await TrailerStorage.findOne({
                contentId: contentId,
                isActive: true
            });

            if (doubleCheck && fs.existsSync(doubleCheck.localPath)) {
                console.log(`📦 Another request already downloaded: ${contentId}`);
                return doubleCheck.localPath;
            }

            // Download video as MP4
            const downloadResult = await this.downloadYouTubeMP4(youtubeUrl, metadata.title);

            // Store permanently
            const result = await storageManager.saveVideo(
                contentId,
                downloadResult.path,
                {
                    ...metadata,
                    format: 'mp4',
                    extension: 'mp4'
                }
            );

            console.log(`✅ Stored: ${contentId}`);

            // Cleanup temp files
            this.cleanupTempFiles();

            return result.path;

        } catch (error) {
            console.error('❌ Download and store failed:', error);
            throw error;
        } finally {
            // Always release lock
            if (lockAcquired) {
                this.releaseLock(contentId);
            }
        }
    }

    // Cleanup temp files
    cleanupTempFiles() {
        try {
            const files = fs.readdirSync(this.tempDir);
            let cleaned = 0;
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);

                if (!fs.existsSync(filePath)) continue;

                const stats = fs.statSync(filePath);
                const age = now - stats.mtimeMs;

                // Delete files older than 1 hour
                if (age > 3600000) {
                    if (stats.isDirectory()) {
                        fs.rmSync(filePath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(filePath);
                    }
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                console.log(`🧹 Cleaned ${cleaned} temp files/dirs`);
            }

        } catch (error) {
            console.log('Temp cleanup failed:', error.message);
        }
    }
}

// Create single instance
const downloadService = new DownloadService();
export default downloadService;