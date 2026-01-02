import express from 'express';
import fs from 'fs';
import axios from 'axios';
import storageManager from '../services/storageManager.js';
import downloadService from '../services/downloadService.js';
import TrailerStorage from '../models/TrailerStorage.js';

const router = express.Router();

// Use Cloudflare worker instead of direct TMDB
const WORKER_URL = "https://tmdb-worker.kumararsh4720.workers.dev";

// Health check
router.get('/health', async (req, res) => {
    try {
        // Ensure storage is initialized
        if (!storageManager.initialized) {
            await storageManager.init();
        }
        
        const status = await storageManager.getStorageStatus();
        res.json({
            success: true,
            status: 'OK',
            ...status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper function to find the best trailer
function findBestTrailer(videos) {
    if (!videos || videos.length === 0) return null;
    
    const youtubeVideos = videos.filter(v => v.site === 'YouTube');
    if (youtubeVideos.length === 0) return null;
    
    // Priority 1: Official Trailer (not short/vertical)
    const officialTrailer = youtubeVideos.find(v => 
        v.official === true && 
        v.type === 'Trailer' &&
        !v.name.toLowerCase().includes('short') &&
        !v.name.toLowerCase().includes('vertical') &&
        !v.name.toLowerCase().includes('tiktok') &&
        !v.name.toLowerCase().includes('reel')
    );
    
    if (officialTrailer) {
        console.log(`🎯 Selected: Official Trailer - "${officialTrailer.name}"`);
        return officialTrailer;
    }
    
    // Priority 2: Official Teaser (not short/vertical)
    const officialTeaser = youtubeVideos.find(v => 
        v.official === true && 
        v.type === 'Teaser' &&
        !v.name.toLowerCase().includes('short') &&
        !v.name.toLowerCase().includes('vertical') &&
        !v.name.toLowerCase().includes('tiktok') &&
        !v.name.toLowerCase().includes('reel')
    );
    
    if (officialTeaser) {
        console.log(`🎯 Selected: Official Teaser - "${officialTeaser.name}"`);
        return officialTeaser;
    }
    
    // Priority 3: Any Trailer (not short/vertical)
    const anyTrailer = youtubeVideos.find(v => 
        v.type === 'Trailer' &&
        !v.name.toLowerCase().includes('short') &&
        !v.name.toLowerCase().includes('vertical') &&
        !v.name.toLowerCase().includes('tiktok') &&
        !v.name.toLowerCase().includes('reel')
    );
    
    if (anyTrailer) {
        console.log(`🎯 Selected: Trailer - "${anyTrailer.name}"`);
        return anyTrailer;
    }
    
    // Priority 4: Any Teaser (not short/vertical)
    const anyTeaser = youtubeVideos.find(v => 
        v.type === 'Teaser' &&
        !v.name.toLowerCase().includes('short') &&
        !v.name.toLowerCase().includes('vertical') &&
        !v.name.toLowerCase().includes('tiktok') &&
        !v.name.toLowerCase().includes('reel')
    );
    
    if (anyTeaser) {
        console.log(`🎯 Selected: Teaser - "${anyTeaser.name}"`);
        return anyTeaser;
    }
    
    // Priority 5: Any YouTube video that doesn't look like a short
    const nonShortVideo = youtubeVideos.find(v => 
        !v.name.toLowerCase().includes('short') &&
        !v.name.toLowerCase().includes('vertical') &&
        !v.name.toLowerCase().includes('tiktok') &&
        !v.name.toLowerCase().includes('reel')
    );
    
    if (nonShortVideo) {
        console.log(`🎯 Selected: Non-short video - "${nonShortVideo.name}"`);
        return nonShortVideo;
    }
    
    // Last resort: First YouTube video (could be short/vertical)
    console.log(`⚠️ Warning: No suitable trailer found, using first available`);
    return youtubeVideos[0];
}

// Get trailer - main endpoint
router.get('/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const contentId = `${type}_${id}`;
        
        console.log(`🎬 Request for: ${contentId}`);
        
        // Check if we have it locally
        const videoInfo = await storageManager.getVideoInfo(contentId);
        
        if (videoInfo) {
            console.log(`📂 Serving from local storage: ${contentId}`);
            streamVideoFile(videoInfo.path, req, res);
            return;
        }
        
        // Not found locally - fetch from TMDB via worker
        console.log(`⬇️ Not found locally, fetching via worker: ${contentId}`);
        
        const tmdbEndpoint = type === 'tv' ? 'tv' : 'movie';
        
        try {
            const [contentRes, videosRes] = await Promise.all([
                axios.get(`${WORKER_URL}/${tmdbEndpoint}/${id}`),
                axios.get(`${WORKER_URL}/${tmdbEndpoint}/${id}/videos`)
            ]);
            
            const contentData = contentRes.data;
            const videos = videosRes.data.results || [];
            
            // Find the best trailer using our new function
            const trailer = findBestTrailer(videos);
            
            if (!trailer) {
                console.log(`❌ No YouTube trailer found for ${contentId}`);
                return res.status(404).json({
                    success: false,
                    error: 'No trailer available',
                    fallback: 'backdrop'
                });
            }
            
            // Log trailer details for debugging
            console.log(`🎬 Selected trailer details:`);
            console.log(`   Title: "${trailer.name}"`);
            console.log(`   Type: ${trailer.type}`);
            console.log(`   Official: ${trailer.official}`);
            console.log(`   YouTube ID: ${trailer.key}`);
            
            const contentTitle = type === 'tv' ? contentData.name : contentData.title;
            const youtubeUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
            
            console.log(`📥 Found trailer: ${contentTitle} (${youtubeUrl})`);
            
            // Download and store
            const metadata = {
                tmdbId: id,
                mediaType: type,
                title: contentTitle,
                priority: 2
            };
            
            const videoPath = await downloadService.downloadAndStore(
                contentId, 
                youtubeUrl, 
                metadata
            );
            
            // Stream the downloaded file
            console.log(`🎬 Streaming downloaded file: ${contentId}`);
            streamVideoFile(videoPath, req, res);
            
        } catch (tmdbError) {
            console.error(`❌ TMDB fetch error for ${contentId}:`, tmdbError.message);
            
            if (tmdbError.response?.status === 404) {
                return res.status(404).json({
                    success: false,
                    error: 'Content not found on TMDB',
                    fallback: 'backdrop'
                });
            }
            
            throw tmdbError; // Re-throw to be caught by outer catch
        }
        
    } catch (error) {
        console.error('❌ Trailer error:', error.message);
        console.error('Stack:', error.stack);
        
        // Return fallback information
        res.status(500).json({
            success: false,
            error: error.message,
            fallback: 'youtube',
            message: 'Use YouTube as fallback'
        });
    }
});

// Helper function to stream video files - NO CHANGES
function streamVideoFile(filePath, req, res) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error('Video file not found');
        }
        
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;
        const range = req.headers.range;
        
        if (range) {
            // Parse range header
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            
            const chunksize = (end - start) + 1;
            
            // Create read stream
            const fileStream = fs.createReadStream(filePath, { start, end });
            
            // Set headers
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            
            res.writeHead(206, head);
            fileStream.pipe(res);
            
        } else {
            // Send entire file
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
                'Cache-Control': 'public, max-age=604800', // 7 days cache
            };
            
            res.writeHead(200, head);
            fs.createReadStream(filePath).pipe(res);
        }
        
    } catch (error) {
        console.error('❌ Stream error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to stream video'
        });
    }
}

// Get storage status - NO CHANGES
router.get('/storage/status', async (req, res) => {
    try {
        const status = await storageManager.getStorageStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Manually trigger cleanup - NO CHANGES
router.post('/storage/cleanup', async (req, res) => {
    try {
        const deleted = await storageManager.cleanup();
        res.json({
            success: true,
            deletedCount: deleted,
            message: 'Cleanup completed'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// List all locally stored trailers - NO CHANGES
router.get('/list/local', async (req, res) => {
    try {
        const trailers = await TrailerStorage.find({ isActive: true })
            .sort({ lastAccessed: -1 })
            .limit(50);
        
        res.json({
            success: true,
            count: trailers.length,
            trailers: trailers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;